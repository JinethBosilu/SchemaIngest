"""CLI entry point for SchemaIngest agent."""

from __future__ import annotations

import json
import sys

import click

from schemaingest import __version__
from schemaingest.security import generate_pairing_code, redact_password, set_pairing_code

WEB_UI_URL = "https://jinethbosilu.github.io/SchemaIngest/"


def _banner(lines: list[str]) -> str:
    """A box sized to its contents. Plain ASCII, so it lines up on any console
    (Windows code pages included) - emoji are double-width and would not."""
    width = max(len(line) for line in lines) + 4
    rule = "+" + "-" * width + "+"
    body = [f"|  {line.ljust(width - 4)}  |" for line in lines]
    return "\n".join([rule, *body, rule])


@click.group()
@click.version_option(__version__, prog_name="schemaingest")
def main():
    """SchemaIngest — local database schema introspection agent."""


@main.command()
@click.option("--port", default=8420, show_default=True, help="Port to listen on (127.0.0.1 only).")
def agent(port: int):
    """Start the SchemaIngest agent server."""
    import uvicorn

    from schemaingest.server import create_app

    # The agent only ever binds to loopback: it holds database credentials.
    host = "127.0.0.1"
    code = generate_pairing_code()
    set_pairing_code(code)

    click.echo("")
    click.echo(_banner([
        f"SchemaIngest Agent v{__version__}",
        "",
        f"Pairing code:  {code}",
        "Enter this code in the web UI to connect.",
        "",
        f"Agent:   http://{host}:{port}",
        f"Web UI:  {WEB_UI_URL}",
    ]))
    click.echo("")

    uvicorn.run(create_app(), host=host, port=port, log_level="info")


@main.command()
@click.option(
    "--conn", required=True,
    help="Connection string: postgresql://user:pass@host/db or mysql://user:pass@host/db.",
)
@click.option("--out", required=True, type=click.Path(dir_okay=False), help="Output file path.")
@click.option(
    "--schema", default=None,
    help="Schema to introspect. PostgreSQL: defaults to public. MySQL: the database in --conn.",
)
@click.option(
    "--format", "fmt",
    type=click.Choice(["json", "txt"]), default="json", show_default=True,
    help="json: the full schema pack. txt: the compact text for pasting into an AI.",
)
def pull(conn: str, out: str, schema: str | None, fmt: str):
    """Export the schema without the web UI."""
    from schemaingest.introspect import introspect
    from schemaingest.models import ConnectRequest
    from schemaingest.renderers import render_schema_txt

    click.echo(f"Connecting to: {redact_password(conn)}")

    try:
        pack = introspect(ConnectRequest(connectionString=conn, schema=schema))
    except Exception as e:
        click.echo(f"Connection failed: {redact_password(str(e))}", err=True)
        sys.exit(1)

    with open(out, "w", encoding="utf-8") as f:
        if fmt == "txt":
            f.write(render_schema_txt(pack))
        else:
            json.dump(pack.model_dump(by_alias=True), f, indent=2)

    click.echo(f"Schema written to {out}")
    click.echo(f"   Tables: {len(pack.tables)}, Relationships: {len(pack.relationships)}")


if __name__ == "__main__":
    main()
