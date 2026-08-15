# Omni Token Queue - zero npm dependencies, so the image build needs no
# network access beyond pulling the base Node image.
FROM node:22-slim

WORKDIR /app

COPY . .

# Where the SQLite database file lives - mount this as a volume so data
# survives container restarts/upgrades.
ENV DB_PATH=/app/data/omni_token_queue.sqlite
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "--experimental-sqlite", "server.js"]
