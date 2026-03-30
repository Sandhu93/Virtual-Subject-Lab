FROM nginx:1.27-alpine

COPY apps/frontend/public /usr/share/nginx/html
