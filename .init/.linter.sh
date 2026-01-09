#!/bin/bash
cd /home/kavia/workspace/code-generation/user-approval-system-197385-197396/frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

