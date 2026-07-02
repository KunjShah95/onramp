"""Direct regression test for fix 2.2: query_documents' "in" filter used to
be a silent no-op. Covers InMemoryStorage directly (used by tests/local runs)
in addition to the end-to-end coverage in test_rbac_access_guard.py.
"""


async def test_in_filter_matches_subset(storage):
    await storage.create_document("widgets", "a", {"team_id": "t1"})
    await storage.create_document("widgets", "b", {"team_id": "t2"})
    await storage.create_document("widgets", "c", {"team_id": "t3"})

    results = await storage.query_documents("widgets", [("team_id", "in", ["t1", "t3"])])

    ids = {r["id"] for r in results}
    assert ids == {"a", "c"}


async def test_in_filter_with_empty_list_matches_nothing(storage):
    await storage.create_document("widgets", "a", {"team_id": "t1"})

    results = await storage.query_documents("widgets", [("team_id", "in", [])])
    assert results == []


async def test_in_filter_combined_with_equality(storage):
    await storage.create_document("widgets", "a", {"team_id": "t1", "status": "active"})
    await storage.create_document("widgets", "b", {"team_id": "t1", "status": "archived"})

    results = await storage.query_documents(
        "widgets", [("team_id", "in", ["t1"]), ("status", "==", "active")]
    )
    ids = {r["id"] for r in results}
    assert ids == {"a"}
