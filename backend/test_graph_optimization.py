import sys
import os
from pathlib import Path

# Add backend to Python path
sys.path.insert(0, str(Path(__file__).parent))

from app.graph import DependencyGraph

def test_no_collapse_under_threshold():
    """Graph should not collapse if node count is below threshold."""
    graph = DependencyGraph()
    graph.add_module("src/components/Button.tsx", {"language": "typescript"})
    graph.add_module("src/components/Input.tsx", {"language": "typescript"})
    graph.add_dependency("src/components/Button.tsx", "src/components/Input.tsx")

    result = graph.to_dict(max_nodes=10)
    assert result["is_collapsed"] is False
    assert len(result["modules"]) == 2
    assert "src/components/Button.tsx" in result["modules"]
    print("test_no_collapse_under_threshold passed [OK]")

def test_collapse_above_threshold():
    """Graph should collapse to directory clusters when node count exceeds threshold."""
    graph = DependencyGraph()
    
    # Add 20 files in 4 different directories
    for i in range(5):
        graph.add_module(f"src/components/ui/Button{i}.tsx", {"language": "typescript"})
        graph.add_module(f"src/components/common/Card{i}.tsx", {"language": "typescript"})
        graph.add_module(f"src/services/auth/Auth{i}.ts", {"language": "typescript"})
        graph.add_module(f"src/pages/dashboard/Panel{i}.tsx", {"language": "typescript"})
        
    # Add cross-directory dependencies
    graph.add_dependency("src/pages/dashboard/Panel0.tsx", "src/components/ui/Button0.tsx")
    graph.add_dependency("src/pages/dashboard/Panel1.tsx", "src/services/auth/Auth0.ts")
    graph.add_dependency("src/components/common/Card0.tsx", "src/components/ui/Button1.tsx")
    graph.add_dependency("src/services/auth/Auth1.ts", "src/components/common/Card1.tsx")

    # Call to_dict with low threshold (max_nodes = 5) to trigger collapse
    result = graph.to_dict(max_nodes=5)
    
    assert result["is_collapsed"] is True
    # The collapsed nodes should be grouped at folder levels:
    # "src/components/ui", "src/components/common", "src/services/auth", "src/pages/dashboard"
    print("Collapsed modules count:", len(result["modules"]))
    print("Collapsed modules list:", result["modules"])
    assert len(result["modules"]) <= 5
    assert "src/components/ui" in result["modules"]
    assert "src/components/common" in result["modules"]
    assert "src/services/auth" in result["modules"]
    assert "src/pages/dashboard" in result["modules"]

    # Verify edge remapping
    print("Collapsed dependencies:", result["dependencies"])
    # Panel0 -> Button0 => src/pages/dashboard -> src/components/ui
    assert "src/pages/dashboard" in result["dependencies"].get("src/components/ui", [])
    # Panel1 -> Auth0 => src/pages/dashboard -> src/services/auth
    assert "src/pages/dashboard" in result["dependencies"].get("src/services/auth", [])
    # Card0 -> Button1 => src/components/common -> src/components/ui
    assert "src/components/common" in result["dependencies"].get("src/components/ui", [])
    
    # Verify node_files details mapping
    assert len(result["node_files"]["src/components/ui"]) == 5
    assert "src/components/ui/Button0.tsx" in result["node_files"]["src/components/ui"]

    print("test_collapse_above_threshold passed [OK]")

if __name__ == "__main__":
    print("Running graph optimization tests...")
    try:
        test_no_collapse_under_threshold()
        test_collapse_above_threshold()
        print("\nAll graph optimization tests PASSED successfully!")
    except AssertionError as e:
        print(f"\nAssertion failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        sys.exit(1)
