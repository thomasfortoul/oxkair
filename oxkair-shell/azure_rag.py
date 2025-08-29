#!/usr/bin/env python3
"""
Minimal Azure Search helper — **search only**.

- Prefers SEARCH_KEY (AzureKeyCredential); falls back to DefaultAzureCredential.
- Uses semantic search with optional semantic configuration.
- Strips any "text_vector" fields from returned documents.
- Query is provided directly via the QUERY variable (no CLI args).
"""

import os, json
from typing import Any, List
from dotenv import load_dotenv
load_dotenv(".env.local")

from azure.identity import DefaultAzureCredential
from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.core.exceptions import HttpResponseError

# Config (edit these or set env vars)
ENDPOINT = os.getenv("SEARCH_ENDPOINT", "https://oxkairsearchdb.search.windows.net")
INDEX_NAME = os.getenv("SEARCH_INDEX_NAME", "ncci-rag")
SEARCH_KEY = os.getenv("SEARCH_KEY")  # admin key preferred
# The query string is defined here (edit directly)
QUERY = "modifier 80, assistant surgeon, surgery"
TOP = 5

if not ENDPOINT or not INDEX_NAME:
    raise SystemExit("Please set SEARCH_ENDPOINT and SEARCH_INDEX_NAME environment variables.")

cred = AzureKeyCredential(SEARCH_KEY) if SEARCH_KEY else DefaultAzureCredential()
client = SearchClient(endpoint=ENDPOINT, index_name=INDEX_NAME, credential=cred)

def _remove_key_recursive(obj: Any, target: str = "text_vector") -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return {k: _remove_key_recursive(v, target) for k, v in obj.items() if k != target}
    if isinstance(obj, list):
        return [_remove_key_recursive(v, target) for v in obj]
    if isinstance(obj, tuple):
        return tuple(_remove_key_recursive(v, target) for v in obj)
    return obj

def _unwrap_search_result(r: Any) -> Any:
    if r is None:
        return None
    if isinstance(r, dict):
        return _remove_key_recursive(r)
    if hasattr(r, "document"):
        try:
            return _remove_key_recursive(r.document)
        except Exception:
            pass
    if hasattr(r, "get") or hasattr(r, "items"):
        try:
            return _remove_key_recursive(dict(r))
        except Exception:
            pass
    return r

def search(query: str, top: int = 5) -> dict:
    try:
        kwargs = {"search_text": query, "include_total_count": True, "top": top, "query_type": "semantic"}
        results = client.search(**kwargs)
        docs: List[dict] = [_unwrap_search_result(r) for r in results]
        approx_count = None
        try:
            approx_count = results.get_count()
        except Exception:
            approx_count = None

        parent_ids, seen = [], set()
        for d in docs:
            if isinstance(d, dict):
                pid = d.get("parent_id")
                if pid is not None:
                    s = str(pid)
                    if s not in seen:
                        seen.add(s); parent_ids.append(s)

        if parent_ids:
            print("parent_ids:", ", ".join(parent_ids))
        else:
            print("parent_ids: (none)")

        out = {"query": query, "approx_total_count": approx_count, "parent_ids": parent_ids, "results": docs}
        print(json.dumps(out, indent=2))
        return out

    except HttpResponseError as e:
        status = getattr(e, "status_code", None) or (getattr(e, "response", None) and getattr(e.response, "status_code", None))
        err = {"error": {"status": status, "message": str(e)}}
        print(json.dumps(err, indent=2), flush=True)
        raise

if __name__ == "__main__":
    search(QUERY, top=10)
