from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum

class EntityType(str, Enum):
    CLASS = "class"
    FUNCTION = "function"
    INTERFACE = "interface"
    MODULE = "module"
    VARIABLE = "variable"
    CONSTANT = "constant"

class RelationshipType(str, Enum):
    IMPORTS = "imports"
    CALLS = "calls"
    INHERITS = "inherits"
    IMPLEMENTS = "implements"
    DEPENDS_ON = "depends_on"

class EntityRange(BaseModel):
    start_line: int
    end_line: int
    start_col: int
    end_col: int

class Entity(BaseModel):
    id: str = Field(..., description="Unique identifier for the entity (e.g., file_path:line:col)")
    name: str = Field(..., description="Name of the entity")
    type: EntityType = Field(..., description="Type of the entity")
    range: EntityRange = Field(..., description="Source code location")
    parent_id: Optional[str] = Field(None, description="ID of the containing entity (e.g., class containing a method)")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional semantic information (e.g., decorators, arguments)")

class Relationship(BaseModel):
    source_id: str = Field(..., description="ID of the source entity")
    target_id: str = Field(..., description="ID of the target entity")
    type: RelationshipType = Field(..., description="Type of relationship")
    metadata: Dict[str, Any] = Field(default_factory=dict)

class FileAnalysis(BaseModel):
    path: str = Field(..., description="Relative path to the file")
    language: str = Field(..., description="Programming language")
    size: int = Field(..., description="File size in bytes")
    entities: List[Entity] = Field(default_factory=list)

class RepositoryStats(BaseModel):
    total_files: int
    total_lines: int
    language_distribution: Dict[str, int]
    complexity_score: Optional[float] = None

class RepositoryAnalysis(BaseModel):
    url: str
    default_branch: str
    head_commit: str
    stats: RepositoryStats
    files: List[FileAnalysis]
    relationships: List[Relationship]
