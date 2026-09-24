# Grounded-answer evaluation fixtures

Fixtures in this directory are synthetic examples for exercising the evaluator;
they are not customer evidence or published product benchmarks.

Run one fixture from `backend/`:

```bash
python scripts/run_ai_evals.py evals/sample_cases.json
```

Replace the sample answer with a captured model response only when the fixture is explicitly marked as a validation run, and keep customer/repository content out of version control unless the data-use policy permits it.
