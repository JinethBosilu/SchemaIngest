"""CLI entry point for SchemaIngest agent."""

from __future__ import annotations

import json
import sys

import click

from schemaingest import __version__
from schemaingest.security import generate_pairing_code, redact_password, set_pairing_code


@click.group()
@click.version_option(__version__, prog_name="schemaingest")
def main():
    """SchemaIngest — local database schema introspection agent."""
    pass


@main.command()
@click.option("--host", default="127.0.0.1", show_default=True, help="Bind address (always use 127.0.0.1 for security).")
@click.option("--port", default=8420, show_default=True, help="Port to listen on.")
def agent(host: str, port: int):
    """Start the SchemaIngest agent server."""
    import uvicorn

    from schemaingest.server import create_app

    # Force localhost only
    if host != "127.0.0.1":
        click.echo("⚠  Security: overriding host to 127.0.0.1 (agent must not bind to 0.0.0.0)")
        host = "127.0.0.1"

    code = generate_pairing_code()
    set_pairing_code(code)

    click.echo("")
    click.echo("╔══════════════════════════════════════════════════════════╗")
    click.echo("║              SchemaIngest Agent v" + __version__.ljust(24) + "║")
    click.echo("╠══════════════════════════════════════════════════════════╣")
    click.echo("║                                                          ║")
    click.echo(f"║   🔑 Pairing Code:  {code}                              ║")
    click.echo("║                                                          ║")
    click.echo("║   Enter this code in the Web UI to connect.              ║")
    click.echo("║                                                          ║")
    click.echo(f"║   🌐 Agent:  http://{host}:{port}                     ║")
    click.echo("║   🖥  Web UI: https://jinethbosilu.github.io/SchemaIngest/║")
    click.echo("║                                                          ║")
    click.echo("╚══════════════════════════════════════════════════════════╝")
    click.echo("")

    app = create_app()
    uvicorn.run(app, host=host, port=port, log_level="info")


@main.command()
@click.option("--conn", required=True, help="PostgreSQL connection string.")
@click.option("--out", required=True, type=click.Path(), help="Output file path for schema pack JSON.")
@click.option("--schema", default="public", show_default=True, help="Schema to introspect.")
def pull(conn: str, out: str, schema: str):
    """Export a schema pack JSON without the web UI."""
    from schemaingest.introspect import introspect_postgres

    click.echo(f"Connecting to: {redact_password(conn)}")

    try:
        pack = introspect_postgres(conn, schema=schema)
    except Exception as e:
        click.echo(f"❌ Connection failed: {redact_password(str(e))}", err=True)
        sys.exit(1)

    data = pack.model_dump(by_alias=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    click.echo(f"✅ Schema pack written to {out}")
    click.echo(f"   Tables: {len(pack.tables)}, Relationships: {len(pack.relationships)}")


if __name__ == "__main__":
    main()
