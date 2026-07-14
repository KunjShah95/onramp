from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Any, Dict, Optional

from app.agents import QuizGenerator
from app.api.v1.auth import get_current_user
from app.services.postgres_db import get_storage, generate_id


router = APIRouter(prefix="/quiz", tags=["quiz"])

QUIZZES_COLLECTION = "onramp_quizzes"
RESULTS_COLLECTION = "onramp_quiz_results"


class GenerateQuizRequest(BaseModel):
    mode: str  # "module" or "repo"
    module_name: Optional[str] = None
    repo_structure: dict
    num_questions: int = 5
    difficulty: str = "mixed"


class SubmitAnswersRequest(BaseModel):
    answers: Dict[str, Any]


# ── Generate Quiz ────────────────────────────────────────────


@router.post("/generate")
async def generate_quiz(
    request: GenerateQuizRequest,
    req: Request,
    user: dict = Depends(get_current_user),
):
    """Generate a knowledge-check quiz for a module or the full codebase."""
    llm = getattr(req.app.state, "llm", None)
    generator = QuizGenerator(llm)

    try:
        result = await generator.execute(
            mode=request.mode,
            module_name=request.module_name,
            repo_structure=request.repo_structure,
            num_questions=request.num_questions,
            difficulty=request.difficulty,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    uid = user.get("uid", "anonymous")
    quiz_id = generate_id()
    storage = get_storage()

    await storage.create_document(QUIZZES_COLLECTION, quiz_id, {
        "quiz_id": quiz_id,
        "user_id": uid,
        "mode": request.mode,
        "module": request.module_name or "full_codebase",
        "difficulty": request.difficulty,
        "total_questions": len(result.get("questions", [])),
        "questions": result.get("questions", []),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "quiz_id": quiz_id,
        "mode": request.mode,
        "module": request.module_name or "full_codebase",
        "total_questions": len(result.get("questions", [])),
        "questions": result.get("questions", []),
    }


# ── Get Quiz (without answers for fresh attempts) ────────────


@router.get("/{quiz_id}")
async def get_quiz(
    quiz_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a quiz. Returns questions without correct answers for a fresh attempt."""
    storage = get_storage()
    doc = await storage.get_document(QUIZZES_COLLECTION, quiz_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Return questions without correct_answer field for a fresh quiz attempt
    questions_stripped = []
    for q in doc.get("questions", []):
        q_copy = dict(q)
        q_copy.pop("correct_answer", None)
        q_copy.pop("explanation", None)
        questions_stripped.append(q_copy)

    return {
        "quiz_id": quiz_id,
        "mode": doc.get("mode"),
        "module": doc.get("module"),
        "difficulty": doc.get("difficulty"),
        "total_questions": doc.get("total_questions"),
        "questions": questions_stripped,
    }


# ── Get Quiz with Answers (teacher/reviewer access) ──────────


@router.get("/{quiz_id}/answers")
async def get_quiz_with_answers(
    quiz_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a quiz with correct answers included (for review/reference)."""
    storage = get_storage()
    doc = await storage.get_document(QUIZZES_COLLECTION, quiz_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Quiz not found")

    return {
        "quiz_id": quiz_id,
        "mode": doc.get("mode"),
        "module": doc.get("module"),
        "difficulty": doc.get("difficulty"),
        "total_questions": doc.get("total_questions"),
        "questions": doc.get("questions", []),
    }


# ── Submit Answers ───────────────────────────────────────────


@router.post("/{quiz_id}/submit")
async def submit_quiz_answers(
    quiz_id: str,
    request: SubmitAnswersRequest,
    req: Request,
    user: dict = Depends(get_current_user),
):
    """Submit answers for a quiz and get evaluated results."""
    storage = get_storage()
    quiz_doc = await storage.get_document(QUIZZES_COLLECTION, quiz_id)
    if not quiz_doc:
        raise HTTPException(status_code=404, detail="Quiz not found")

    uid = user.get("uid", "anonymous")
    llm = getattr(req.app.state, "llm", None)
    generator = QuizGenerator(llm)

    try:
        result = await generator.evaluate_answers(
            quiz=quiz_doc,
            answers=request.answers,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Store result
    result_id = generate_id()
    await storage.create_document(RESULTS_COLLECTION, result_id, {
        "result_id": result_id,
        "quiz_id": quiz_id,
        "user_id": uid,
        "module": quiz_doc.get("module"),
        "answers": request.answers,
        "score": result.get("score"),
        "total": result.get("total"),
        "percentage": result.get("percentage"),
        "passed": result.get("passed"),
        "results": result.get("results"),
        "summary": result.get("summary"),
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    })

    # Award XP for passing quiz
    if result.get("passed"):
        try:
            await quiz_graded(
                user_id=uid,
                quiz_id=quiz_id,
                score=result.get("score"),
                total=result.get("total"),
                percentage=result.get("percentage"),
                passed=True,
            )
        except Exception:
            pass  # Notification is non-critical

        # Award XP (fire-and-forget — never block on gamification)
        try:
            from app.services.gamification_service import award_xp as _award_xp
            await _award_xp(user_id=uid, source="quiz_passed")
            # Bonus XP for perfect score
            if result.get("score", 0) == result.get("total", 0):
                await _award_xp(user_id=uid, source="quiz_perfect_score")
        except Exception:
            pass  # XP award is non-critical

    return {
        "result_id": result_id,
        "quiz_id": quiz_id,
        "score": result.get("score"),
        "total": result.get("total"),
        "percentage": result.get("percentage"),
        "passed": result.get("passed"),
        "results": result.get("results"),
        "summary": result.get("summary"),
    }


# ── List Quizzes ─────────────────────────────────────────────


@router.get("/")
async def list_quizzes(
    user: dict = Depends(get_current_user),
    module: Optional[str] = None,
    limit: int = 20,
):
    """List available quizzes, optionally filtered by module."""
    storage = get_storage()
    filters = [("user_id", "==", user.get("uid"))] if user.get("uid") else []
    if module:
        filters.append(("module", "==", module))

    rows = await storage.query_documents(QUIZZES_COLLECTION, filters)
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)

    # Return metadata without questions
    results = []
    for r in rows[:limit]:
        results.append({
            "quiz_id": r.get("quiz_id"),
            "mode": r.get("mode"),
            "module": r.get("module"),
            "difficulty": r.get("difficulty"),
            "total_questions": r.get("total_questions"),
            "created_at": r.get("created_at"),
        })

    return {"quizzes": results}


# ── Get Results ──────────────────────────────────────────────


@router.get("/{quiz_id}/results")
async def get_quiz_results(
    quiz_id: str,
    user: dict = Depends(get_current_user),
):
    """Get all results for a specific quiz."""
    storage = get_storage()
    rows = await storage.query_documents(
        RESULTS_COLLECTION,
        [("quiz_id", "==", quiz_id)],
    )

    uid = user.get("uid", "")
    # Filter to user's own results
    user_results = [r for r in rows if r.get("user_id") == uid]
    user_results.sort(key=lambda r: r.get("submitted_at", ""), reverse=True)

    return {
        "quiz_id": quiz_id,
        "results": user_results,
        "attempts": len(user_results),
        "best_score": max((r.get("percentage", 0) for r in user_results), default=0),
    }


# ── Helper: notify quiz graded ───────────────────────────────


async def quiz_graded(
    user_id: str,
    quiz_id: str,
    score: int,
    total: int,
    percentage: float,
    passed: bool,
):
    """Notify a user that their quiz was graded."""
    from app.services.notification_service import create_notification

    await create_notification(
        user_id=user_id,
        type="quiz_graded",
        title="Quiz Graded 📝",
        message=f"You scored {score}/{total} ({percentage}%) — {'Passed!' if passed else 'Needs improvement.'}",
        metadata={
            "quiz_id": quiz_id,
            "score": score,
            "total": total,
            "percentage": percentage,
            "passed": passed,
        },
    )
