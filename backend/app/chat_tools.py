# app/chat_tools.py
"""
Tool execution handlers for PUMi.
Handles file creation, summaries, etc.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List
from datetime import datetime


def execute_tool(tool_name: str, tool_input: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute a tool and return the result.
    
    Returns:
        {
            "success": bool,
            "result": Any,
            "files_created": List[Dict] (optional)
        }
    """
    if tool_name == "create_summary_with_files":
        return _create_summary_with_files(tool_input)
    elif tool_name == "create_markdown_doc":
        return _create_markdown_doc(tool_input)
    elif tool_name == "save_code_snippet":
        return _save_code_snippet(tool_input)
    else:
        return {
            "success": False,
            "error": f"Unknown tool: {tool_name}"
        }


def _create_summary_with_files(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create a summary document with file attachments.
    
    Input:
        {
            "title": str,
            "summary_content": str (markdown),
            "files": [
                {"filename": str, "content": str, "description": str}
            ],
            "tags": List[str] (optional)
        }
    
    Returns formatted for frontend:
        {
            "success": True,
            "result": {
                "type": "summary_with_files",
                "summary": {
                    "id": str,
                    "title": str,
                    "content": str,
                    "tags": List[str],
                    "createdAt": str
                },
                "files": [
                    {
                        "id": str,
                        "filename": str,
                        "content": str,
                        "description": str,
                        "type": "code"
                    }
                ]
            }
        }
    """
    import uuid
    
    title = input_data.get("title", "Untitled Summary")
    summary_content = input_data.get("summary_content", "")
    files = input_data.get("files", [])
    tags = input_data.get("tags", [])
    
    # Generate IDs
    summary_id = f"summary_{uuid.uuid4().hex[:12]}"
    
    # Prepare files with IDs
    prepared_files = []
    for file_data in files:
        file_id = f"file_{uuid.uuid4().hex[:12]}"
        prepared_files.append({
            "id": file_id,
            "filename": file_data.get("filename", "unknown.txt"),
            "content": file_data.get("content", ""),
            "description": file_data.get("description", ""),
            "type": "code"
        })
    
    result = {
        "type": "summary_with_files",
        "summary": {
            "id": summary_id,
            "title": title,
            "content": summary_content,
            "tags": tags,
            "createdAt": datetime.utcnow().isoformat() + "Z"
        },
        "files": prepared_files
    }
    
    return {
        "success": True,
        "result": result,
        "files_created": len(prepared_files) + 1  # summary + files
    }


def _create_markdown_doc(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create a standalone markdown document.
    """
    import uuid
    
    title = input_data.get("title", "Untitled Document")
    content = input_data.get("content", "")
    tags = input_data.get("tags", [])
    
    doc_id = f"doc_{uuid.uuid4().hex[:12]}"
    
    result = {
        "type": "markdown_doc",
        "document": {
            "id": doc_id,
            "title": title,
            "content": content,
            "tags": tags,
            "createdAt": datetime.utcnow().isoformat() + "Z"
        }
    }
    
    return {
        "success": True,
        "result": result,
        "files_created": 1
    }


def _save_code_snippet(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save a single code file.
    """
    import uuid
    
    filename = input_data.get("filename", "code.txt")
    content = input_data.get("content", "")
    description = input_data.get("description", "")
    language = input_data.get("language", "plaintext")
    
    file_id = f"file_{uuid.uuid4().hex[:12]}"
    
    result = {
        "type": "code_snippet",
        "file": {
            "id": file_id,
            "filename": filename,
            "content": content,
            "description": description,
            "language": language,
            "createdAt": datetime.utcnow().isoformat() + "Z"
        }
    }
    
    return {
        "success": True,
        "result": result,
        "files_created": 1
    }
