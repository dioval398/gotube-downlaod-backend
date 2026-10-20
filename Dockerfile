FROM node:20

<<<<<<< HEAD
=======
# Install full system dependencies 
>>>>>>> 7b2732cf2f06b5549060dafcf646dec1016dc49c
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

<<<<<<< HEAD
# Always grab latest build on deploy
=======
# Install the latest stable version of yt-dlp and its companion JS extractor engine
>>>>>>> 7b2732cf2f06b5549060dafcf646dec1016dc49c
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app
<<<<<<< HEAD
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 8080
=======

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8080

>>>>>>> 7b2732cf2f06b5549060dafcf646dec1016dc49c
CMD ["npm", "start"]