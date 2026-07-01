"""
Knowledge Compiler TUI - Terminal Interface
Connects to knowledge-compiler API for code analysis
"""

import os
import asyncio
from typing import Optional
import httpx

from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, Vertical
from textual.widgets import Header, Footer, Static, Input, Button, DataTable, RichLog
from textual.screen import Screen, ModalScreen
from textual.binding import Binding
from textual import work


# API Configuration
API_BASE = os.getenv("API_BASE", "http://localhost:3003")


class API:
    """API client for knowledge-compiler"""

    def __init__(self, base_url: str = API_BASE):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=60.0)
        self.current_repo = None

    async def analyze(self, repo_url: str, branch: str = "main") -> dict:
        """Analyze a repository"""
        response = await self.client.post(
            f"{self.base_url}/api/v1/analyze",
            json={"repo_url": repo_url, "branch": branch},
        )
        response.raise_for_status()
        return response.json()

    async def get_repo(self, owner: str, name: str) -> dict:
        """Get repository data"""
        response = await self.client.get(f"{self.base_url}/api/v1/repos/{owner}/{name}")
        response.raise_for_status()
        return response.json()

    async def get_wiki_pages(self, owner: str, name: str) -> list:
        """Get wiki pages"""
        response = await self.client.get(
            f"{self.base_url}/api/v1/repos/{owner}/{name}/wiki"
        )
        response.raise_for_status()
        return response.json()["pages"]

    async def get_wiki_page(self, owner: str, name: str, page_name: str) -> str:
        """Get specific wiki page"""
        response = await self.client.get(
            f"{self.base_url}/api/v1/repos/{owner}/{name}/wiki/{page_name}"
        )
        response.raise_for_status()
        return response.json()["content"]

    async def query(self, owner: str, name: str, question: str) -> dict:
        """Query the repository"""
        response = await self.client.post(
            f"{self.base_url}/api/v1/repos/{owner}/{name}/query",
            json={"question": question},
        )
        response.raise_for_status()
        return response.json()


api = API()


class AnalyzeScreen(Screen):
    """Screen for analyzing repositories"""

    def __init__(self, app: App):
        super().__init__()
        self.parent_app = app

    def compose(self) -> ComposeResult:
        yield Container(
            Vertical(
                Static("📊 Knowledge Compiler", classes="title"),
                Static(
                    "Analyze GitHub repositories and generate semantic wikis",
                    classes="subtitle",
                ),
                Static("", classes="spacer"),
                Static("Enter GitHub Repository URL:", classes="label"),
                Input(placeholder="https://github.com/owner/repo", id="repo_url"),
                Button("Analyze Repository", variant="primary", id="analyze_btn"),
                Static("", id="status"),
                classes="content",
            ),
            id="analyze",
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "analyze_btn":
            self.analyze_repo()

    @work
    async def analyze_repo(self):
        input_widget = self.query_one("#repo_url", Input)
        repo_url = input_widget.value

        if not repo_url:
            status = self.query_one("#status", Static)
            status.update("❌ Please enter a repository URL")
            return

        status = self.query_one("#status", Static)
        status.update("⏳ Analyzing repository... This may take a minute.")

        try:
            result = await api.analyze(repo_url)

            # Store result
            self.parent_app.current_repo = result.get("repo_id")
            self.parent_app.last_result = result

            status.update(
                f"✅ Analysis complete! Found {result.get('entities_count', 0)} entities."
            )

            # Navigate to dashboard
            self.app.push_screen("dashboard")

        except Exception as e:
            status.update(f"❌ Error: {str(e)}")


class DashboardScreen(Screen):
    """Main dashboard showing analysis results"""

    def __init__(self, app: App):
        super().__init__()
        self.parent_app = app

    def compose(self) -> ComposeResult:
        yield Container(
            Horizontal(
                Vertical(
                    Static("📈 Overview", classes="section_title"),
                    Static("", id="overview_stats"),
                    classes="panel",
                ),
                Vertical(
                    Static("⚠️ Risk Assessment", classes="section_title"),
                    Static("", id="risk_stats"),
                    classes="panel",
                ),
                Vertical(
                    Static("📚 Wiki Pages", classes="section_title"),
                    DataTable(id="wiki_table"),
                    Button("← Back to Analyze", id="back_btn"),
                    classes="panel",
                ),
            ),
            id="dashboard",
        )

    def on_mount(self) -> None:
        self.load_data()

    @work
    async def load_data(self):
        if not self.parent_app.last_result:
            return

        result = self.parent_app.last_result

        # Overview stats
        overview = self.query_one("#overview_stats", Static)
        overview.update(
            f"Files: {result.get('files_count', 0)}\n"
            f"Entities: {result.get('entities_count', 0)}\n"
            f"Graph Nodes: {result.get('graph', {}).get('total_nodes', 0)}\n"
            f"Graph Edges: {result.get('graph', {}).get('total_edges', 0)}"
        )

        # Risk stats
        risk = result.get("risk", {})
        risk_el = self.query_one("#risk_stats", Static)
        risk_emoji = (
            "🟢"
            if risk.get("risk_level") == "low"
            else "🟡"
            if risk.get("risk_level") == "medium"
            else "🔴"
        )
        risk_el.update(
            f"Risk Level: {risk_emoji} {risk.get('risk_level', 'unknown').upper()}\n"
            f"Score: {risk.get('score', 0)}/100\n"
            f"Avg Complexity: {risk.get('avg_complexity', 0)}\n"
            f"High Complexity: {risk.get('high_complexity_count', 0)}"
        )

        # Wiki pages
        table = self.query_one("#wiki_table", DataTable)
        table.add_columns("Page Name")

        for page in result.get("wiki_pages", [])[:20]:
            table.add_row(page)

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        table = self.query_one("#wiki_table", DataTable)
        page_name = table.rows[event.cursor_row].cells[0]
        self.app.push_screen("wiki_viewer", page_name)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "back_btn":
            self.app.pop_screen()


class WikiViewerScreen(Screen):
    """Screen for viewing wiki content"""

    def __init__(self, app: App, page_name: str):
        super().__init__()
        self.parent_app = app
        self.page_name = page_name

    def compose(self) -> ComposeResult:
        yield Container(
            Vertical(
                Static(f"📄 {self.page_name}", classes="section_title"),
                RichLog(id="wiki_content", classes="content"),
                Button("← Back", id="back_btn"),
                classes="content",
            ),
            id="wiki_viewer",
        )

    def on_mount(self) -> None:
        self.load_page()

    @work
    async def load_page(self):
        if not self.parent_app.current_repo:
            return

        try:
            owner, name = self.parent_app.current_repo.split("/")
            content = await api.get_wiki_page(owner, name, self.page_name)

            log = self.query_one("#wiki_content", RichLog)
            log.clear()
            log.write(content)

        except Exception as e:
            log = self.query_one("#wiki_content", RichLog)
            log.write(f"Error loading page: {str(e)}")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "back_btn":
            self.app.pop_screen()


class QueryScreen(Screen):
    """Query interface"""

    def __init__(self, app: App):
        super().__init__()
        self.parent_app = app

    def compose(self) -> ComposeResult:
        yield Container(
            Vertical(
                Static("🔍 Query Repository", classes="section_title"),
                Input(placeholder="Ask about the codebase...", id="question"),
                Button("Ask", variant="primary", id="ask_btn"),
                RichLog(id="answer", classes="answer_box"),
                Button("← Back", id="back_btn"),
                classes="content",
            ),
            id="query",
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "ask_btn":
            self.ask_question()
        elif event.button.id == "back_btn":
            self.app.pop_screen()

    @work
    async def ask_question(self):
        if not self.parent_app.current_repo:
            return

        input_widget = self.query_one("#question", Input)
        question = input_widget.value

        if not question:
            return

        answer_log = self.query_one("#answer", RichLog)
        answer_log.clear()
        answer_log.write(f"⏳ Thinking about: {question}...")

        try:
            owner, name = self.parent_app.current_repo.split("/")
            result = await api.query(owner, name, question)

            answer_log.clear()
            answer_log.write(f"**Q:** {question}\n")

            if result.get("relevant_pages"):
                answer_log.write("\n**Relevant Pages:**\n")
                for page in result["relevant_pages"]:
                    answer_log.write(
                        f"  - {page.get('type')}: {page.get('name', page.get('file'))}"
                    )
            else:
                answer_log.write("\nNo specific matches found. Try a different query.")

        except Exception as e:
            answer_log.clear()
            answer_log.write(f"Error: {str(e)}")


class KnowledgeCompilerApp(App):
    """Main TUI Application"""

    CSS = """
    Screen {
        background: $surface;
    }
    
    #analyze {
        align: center middle;
    }
    
    .content {
        width: 90%;
        height: 90%;
        padding: 1;
    }
    
    .title {
        text-align: center;
        text-style: bold;
        color: $accent;
        dock-size: 3;
    }
    
    .subtitle {
        text-align: center;
        color: $text-muted;
    }
    
    .spacer {
        height: 2;
    }
    
    .label {
        text-style: bold;
        margin-bottom: 1;
    }
    
    #status {
        margin-top: 1;
        color: $text-muted;
    }
    
    #dashboard {
        layout: horizontal;
    }
    
    .panel {
        width: 33%;
        height: 100%;
        border: solid $border;
        padding: 1;
        margin: 1;
    }
    
    .section_title {
        text-style: bold;
        color: $accent;
        text-align: center;
        margin-bottom: 1;
    }
    
    #overview_stats, #risk_stats {
        color: $text;
    }
    
    .content {
        height: 80%;
        overflow-y: auto;
    }
    
    .answer_box {
        height: 50%;
        border: solid $border;
        margin-top: 1;
    }
    """

    BINDINGS = [
        Binding("a", "push_screen('analyze')", "Analyze"),
        Binding("d", "push_screen('dashboard')", "Dashboard"),
        Binding("q", "push_screen('query')", "Query"),
        Binding("escape", "pop_screen", "Back"),
        Binding("q", "quit", "Quit", show=False),
    ]

    current_repo = None
    last_result = None

    def on_mount(self) -> None:
        self.push_screen("analyze")

    def get_current_repo(self) -> Optional[str]:
        return self.current_repo

    def set_current_repo(self, repo_id: str):
        self.current_repo = repo_id


def run():
    """Entry point"""
    app = KnowledgeCompilerApp()
    app.run()


if __name__ == "__main__":
    run()
