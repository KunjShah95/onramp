"""Slack Bot — proactive standup reminders, interactive workflows, and senior notification.

Replaces the CLI daily_update.py flow (scripts/daily_update.py) with a
real Slack bot that:
  1. Sends proactive daily standup reminders to juniors
  2. Handles standup replies and slash commands
  3. Posts standup + auto-digest to a senior-visible channel
  4. Supports interactive acknowledgments and follow-ups
"""

from app.slack_bot.bot import SlackBot

__all__ = ["SlackBot"]
