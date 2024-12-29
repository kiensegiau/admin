#!/bin/bash

# Start 3 instances of the app on different ports
PORT=3000 pm2 start npm --name "video-server-1" -- start
PORT=3001 pm2 start npm --name "video-server-2" -- start
PORT=3002 pm2 start npm --name "video-server-3" -- start

# Monitor logs
pm2 logs 