FROM oven/bun:1.3.14-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-dejavu-core \
    ghostscript \
    imagemagick \
    libreoffice \
  && for policy in /etc/ImageMagick-*/policy.xml; do \
    if [ -f "$policy" ]; then \
      sed -i 's/domain="coder" rights="none" pattern="PDF"/domain="coder" rights="read" pattern="PDF"/' "$policy"; \
    fi; \
  done \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
ENV DECKJSX_RENDER_WITH_TOOLS=1

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

CMD ["bash", ".github/render/run-verify-render.sh"]
