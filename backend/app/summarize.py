# app/summarize.py
"""
Summarization endpoint with tool support.
Creates comprehensive summaries with file attachments.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from .llm_client import _claude_messages_with_tools, _CLAUDE_READY
from .tools import PUMI_TOOLS, get_tool_system_prompt
from .chat_tools import execute_tool

router = APIRouter(tags=["summarize"])


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class SummarizeRequest(BaseModel):
    messages: List[Message]
    lang: str = "hu"
    user_instruction: Optional[str] = None  # Optional custom instruction


class SummarizeResponse(BaseModel):
    ok: bool
    type: str  # "summary_with_files" | "markdown_doc" | "text"
    summary: Optional[Dict[str, Any]] = None
    files: Optional[List[Dict[str, Any]]] = None
    text: Optional[str] = None  # Fallback if no tools used


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_conversation(payload: SummarizeRequest):
    """
    Create a comprehensive summary of a conversation with file attachments.
    
    Uses Claude API with tool support to generate:
    - Structured markdown summary
    - Code/config file attachments
    - Tags for categorization
    """
    if not _CLAUDE_READY:
        raise HTTPException(status_code=503, detail="Claude API not available")
    
    # Build conversation context for Claude
    conversation_text = "BESZÉLGETÉS ÖSSZEFOGLALÁSA:\n\n"
    for msg in payload.messages:
        role_label = "USER" if msg.role == "user" else "PUMi"
        conversation_text += f"{role_label}: {msg.content}\n\n"
    
    # System prompt for summarization
    if payload.lang == "hu":
        system = f"""Te PUMi vagy. A felhasználó kérte, hogy foglald össze ezt a beszélgetést.

{get_tool_system_prompt()}

FELADATOD:
1. Készíts részletes, strukturált markdown összefoglalót
2. Ha technikai munka történt (kód, config), csatold a fájlokat a create_summary_with_files tool-lal
3. Az összefoglaló legyen:
   - Strukturált (## címek, bullet pontok)
   - Actionable (mit kell tenni, hol, hogyan)
   - Részletes (ne csak "fix XYZ", hanem "XYZ fájl 42. sorában változtasd...")
   - Tartalmazza a deployment lépéseket
   - Troubleshooting tippeket ha releváns

4. A fájlok tartalmazzák:
   - A teljes kód/config tartalmat
   - Fájlnevet extension-nel
   - Rövid leírást (mi ez a fájl, mire jó)

Ha nem volt konkrét technikai munka, használd a create_markdown_doc tool-t egyszerű összefoglalóhoz.

BESZÉLGETÉS:
{conversation_text}"""
    else:
        system = f"""You are PUMi. The user asked you to summarize this conversation.

{get_tool_system_prompt()}

YOUR TASK:
1. Create a detailed, structured markdown summary
2. If there was technical work (code, config), attach files using create_summary_with_files tool
3. Make the summary:
   - Structured (## headings, bullets)
   - Actionable (what to do, where, how)
   - Detailed (not just "fix XYZ", but "in XYZ file line 42 change...")
   - Include deployment steps
   - Troubleshooting tips if relevant

4. Files should contain:
   - Full code/config content
   - Filename with extension
   - Brief description

If no concrete technical work, use create_markdown_doc for simple summary.

CONVERSATION:
{conversation_text}"""
    
    # Add user instruction if provided
    user_msg = payload.user_instruction or "Kérlek, készíts részletes összefoglalót fájlokkal együtt."
    
    try:
        # Call Claude with tools
        result = await _claude_messages_with_tools(
            system=system,
            user=user_msg,
            max_tokens=4000,  # Longer for detailed summaries
            temperature=0.3,  # Lower for consistent formatting
            tools=PUMI_TOOLS
        )
        
        # Handle tool use
        if result["type"] == "tool_use":
            tool_calls = result["tool_calls"]
            
            # Execute first tool (usually create_summary_with_files)
            if tool_calls:
                first_tool = tool_calls[0]
                tool_result = execute_tool(first_tool["name"], first_tool["input"])
                
                if tool_result["success"]:
                    result_data = tool_result["result"]
                    
                    if result_data["type"] == "summary_with_files":
                        return SummarizeResponse(
                            ok=True,
                            type="summary_with_files",
                            summary=result_data["summary"],
                            files=result_data["files"]
                        )
                    elif result_data["type"] == "markdown_doc":
                        return SummarizeResponse(
                            ok=True,
                            type="markdown_doc",
                            summary=result_data["document"],
                            files=[]
                        )
                    elif result_data["type"] == "code_snippet":
                        return SummarizeResponse(
                            ok=True,
                            type="code_snippet",
                            files=[result_data["file"]]
                        )
                else:
                    raise HTTPException(status_code=500, detail=tool_result.get("error", "Tool execution failed"))
        
        # Fallback: text response (no tools used)
        return SummarizeResponse(
            ok=True,
            type="text",
            text=result.get("text", "")
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summarization failed: {str(e)}")
