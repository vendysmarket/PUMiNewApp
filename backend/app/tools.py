# app/tools.py
"""
Tool definitions for Claude API function calling.
Enables PUMi to create files, summaries with attachments.
"""

PUMI_TOOLS = [
    {
        "name": "create_summary_with_files",
        "description": """Create a comprehensive summary document with code/config file attachments.
        
Use this when the user asks to:
- "Foglald össze ezt a beszélgetést"
- "Mentsd le ezt fájlokkal"
- "Készíts összefoglalót"
- "Dokumentáld le ezt"

The summary should be:
- Structured with clear sections (## headers)
- Include technical details (file paths, commands, fixes)
- Actionable (what to do, where to change)
- Reference attached files by name

Example structure:
# [Topic] - Summary
## Problem
## Solution  
## Files Changed (5)
## Deployment Steps
## Testing""",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Short descriptive title (e.g. 'Stripe Payment Integration Fix')"
                },
                "summary_content": {
                    "type": "string",
                    "description": "Full markdown summary with sections, bullet points, code examples. Be detailed and actionable."
                },
                "files": {
                    "type": "array",
                    "description": "Array of code/config files to attach",
                    "items": {
                        "type": "object",
                        "properties": {
                            "filename": {
                                "type": "string",
                                "description": "File name with extension (e.g. 'TopBar.tsx', 'config.json')"
                            },
                            "content": {
                                "type": "string",
                                "description": "Full file content (code, config, etc.)"
                            },
                            "description": {
                                "type": "string",
                                "description": "Brief description of what this file does"
                            }
                        },
                        "required": ["filename", "content"]
                    }
                },
                "tags": {
                    "type": "array",
                    "description": "Tags for categorization (e.g. ['stripe', 'payment', 'frontend'])",
                    "items": {"type": "string"}
                }
            },
            "required": ["title", "summary_content"]
        }
    },
    {
        "name": "create_markdown_doc",
        "description": """Create a standalone markdown document (no file attachments).
        
Use for:
- Guides and tutorials
- Meeting notes
- Documentation
- Quick summaries without code

Keep it structured and clear.""",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Document title"
                },
                "content": {
                    "type": "string",
                    "description": "Full markdown content with proper formatting"
                },
                "tags": {
                    "type": "array",
                    "description": "Tags for categorization",
                    "items": {"type": "string"}
                }
            },
            "required": ["title", "content"]
        }
    },
    {
        "name": "save_code_snippet",
        "description": """Save a single code file or config.
        
Use for:
- Code examples
- Configuration files
- Scripts
- Single file fixes

Not for summaries with multiple files.""",
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "File name with extension"
                },
                "content": {
                    "type": "string",
                    "description": "Full file content"
                },
                "description": {
                    "type": "string",
                    "description": "What this file does"
                },
                "language": {
                    "type": "string",
                    "description": "Programming language (e.g. 'typescript', 'python', 'javascript')"
                }
            },
            "required": ["filename", "content"]
        }
    }
]


def get_tool_system_prompt() -> str:
    """System prompt addition for tool usage."""
    return """
FÁJL LÉTREHOZÁS KÉPESSÉG:
Ha a user kéri, hogy:
- "Foglald össze ezt a beszélgetést"
- "Mentsd le ezt fájlokkal"
- "Készíts dokumentációt"
- "Dokumentáld le ezt"

Akkor használd a create_summary_with_files vagy create_markdown_doc tool-t!

FONTOS:
- Készíts részletes, strukturált összefoglalót (mint egy profi dokumentáció)
- Ha volt technikai munka (kód, config), csatold a fájlokat
- Az összefoglaló legyen actionable (mit kell tenni, hol, hogyan)
- NE csak bullet pointok, hanem részletes útmutató
- Használj markdown formázást (##, ```, lista)

PÉLDA JÓ ÖSSZEFOGLALÓ:
# Stripe Payment Integration

## Probléma
A Memberstack checkout nyílt Stripe helyett...

## Megoldás
3 fájl frissítése:
- TopBar.tsx: CHECKOUT_URLS → Stripe linkek
- ...

## Deployment
1. Lovable: TopBar.tsx...
2. ...

## Fájlok (3 db)
- TopBar_READY.tsx
- ...

NE csak: "• Stripe fix • 3 fájl • Kész"
"""
