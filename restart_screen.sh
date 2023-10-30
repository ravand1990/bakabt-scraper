#!/bin/bash

SESSION_NAME="bakabt-scraper"
LOG_FILE="./logfile.log"

if ! screen -list | grep -q "$SESSION_NAME"; then
    echo "Screen session $SESSION_NAME not found, starting..."
    screen -dmS "$SESSION_NAME" -L -Logfile "$LOG_FILE" pnpm ts-node fetchTorrents.ts
else
    echo "Screen session $SESSION_NAME is already running."
fi

