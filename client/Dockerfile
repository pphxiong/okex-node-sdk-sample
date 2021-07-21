#FROM node:current-slim AS build
#COPY . /frontend
#WORKDIR /frontend
#RUN npm i --registry=https://registry.npm.taobao.org
#RUN npm run build
#
#FROM nginx
#COPY --from=build /frontend/base/ /usr/share/nginx/html/

FROM nginx
#RUN mkdir /usr/share/nginx/customer
#RUN mkdir /usr/share/nginx/customer/base
#COPY ./base/ /usr/share/nginx/html/

EXPOSE 80

ADD ./http.conf /etc/nginx/conf.d/default.conf
COPY ./dist/ /usr/share/nginx/html/
#ADD base /var/www/
