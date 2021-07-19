import React from 'react';
import moment from "moment";
import { parse } from 'querystring';
import pathRegexp from 'path-to-regexp';
import Ellipsis from '@/components/Ellipsis';

/* eslint no-useless-escape:0 import/prefer-default-export:0 */
const reg = /(((^https?:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+(?::\d+)?|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)$/;
export const isUrl = path => reg.test(path);
export const isAntDesignPro = () => {
  if (ANT_DESIGN_PRO_ONLY_DO_NOT_USE_IN_YOUR_PRODUCTION === 'site') {
    return true;
  }

  return window.location.hostname === 'preview.pro.ant.design';
}; // 给官方演示站点用，用于关闭真实开发环境不需要使用的特性

export const isAntDesignProOrDev = () => {
  const { NODE_ENV } = process.env;

  if (NODE_ENV === 'development') {
    return true;
  }

  return isAntDesignPro();
};
export const getPageQuery = () => parse(window.location.href.split('?')[1]);
/**
 * props.route.routes
 * @param router [{}]
 * @param pathname string
 */

export const getAuthorityFromRouter = (router = [], pathname) => {
  const authority = router.find(
    ({ routes, path = '/', target = '_self' }) =>
      (path && target !== '_blank' && pathRegexp(path).exec(pathname)) ||
      (routes && getAuthorityFromRouter(routes, pathname)),
  );
  if (authority) return authority;
  return undefined;
};
export const getRouteAuthority = (path, routeData) => {
  let authorities;
  routeData.forEach(route => {
    // match prefix
    if (pathRegexp(`${route.path}/(.*)`).test(`${path}/`)) {
      if (route.authority) {
        authorities = route.authority;
      } // exact match

      if (route.path === path) {
        authorities = route.authority || authorities;
      } // get children authority recursively

      if (route.routes) {
        authorities = getRouteAuthority(path, route.routes) || authorities;
      }
    }
  });
  return authorities;
};

const ellipsisRender = text => (
  <Ellipsis title={text} tooltip lines={1}>
    {text}
  </Ellipsis>
);

export const columnEllipsisHandler = columns => {
  let newColumns = [];
  newColumns = columns.map(item => ({
    ...item,
    title: (
      <Ellipsis title={item.title} tooltip lines={1}>
        {item.title}
      </Ellipsis>
    ),
    render: item.render || ellipsisRender,
  }));
  return newColumns;
};

export function getMacd(params) {
  const {price,lastEma12,lastEma26,lastDea,high,low,time} = params

  const ema12 = toFixedAndToNumber(2/(12+1) * price + 11/(12+1) * lastEma12,4)
  const ema26 = toFixedAndToNumber(2/(26+1) * price + 25/(26+1) * lastEma26,4)

  const diff = toFixedAndToNumber(ema12 - ema26,2)
  const dea = toFixedAndToNumber(2/(9+1) * diff + 8/(9+1) * lastDea,2)

  const column = toFixedAndToNumber(2 * (diff - dea),2)

  const result = {
    price,
    ema12,
    ema26,
    diff,
    dea,
    column,
    high,
    low,
    time
  }

  return result
}
export function toFixedAndToNumber(n,num=1){
  // return Number(n.toFixed(num))
  return Math.round(n * Math.pow(10,num)) / Math.pow(10,num)
}
export function getRSIAverage(list,i,n){
  let diff;
  let gainI = 0;
  let lossI = 0;
  if(i==0) {
    diff = 0;
  }else{
    diff = Number(list[i]) - Number(list[i-1])
    if(diff > 0){
      gainI = Math.max(0,diff)
    }else{
      lossI = Math.max(0,-diff)
    }
  }

  let gainAverageI;
  let lossAverageI;

  if(i==0) {
    gainAverageI = gainI;
    lossAverageI = lossI;
  }else{
    const lastRSIAverage = getRSIAverage(list,i-1,n);
    gainAverageI = (gainI + (n-1) * lastRSIAverage.gainAverageI) / n;
    lossAverageI = (lossI + (n-1) * lastRSIAverage.lossAverageI) / n;
  }

  // console.log('gain','loss',gainAverageI,lossAverageI)
  return {
    gainAverageI,
    lossAverageI,
  }
}
export function getRSIByPeriod(newList, period){
  const result = getRSIAverage(newList,newList.length-1,period)
  const { gainAverageI, lossAverageI } = result
  // const RSI = gainAverageI / (gainAverageI + lossAverageI) * 100
  const RS = gainAverageI / lossAverageI;
  const RSI = 100 - 100 / (1 + RS);
  const newResult = {
    RSI: toFixedAndToNumber(RSI,2),
    gainAverageI,
    lossAverageI
  }
  return newResult;
}
export function getRSI(time,price,list){
  const { RSI: RSI1 } = getRSIByPeriod(list,6)
  const { RSI: RSI2 } = getRSIByPeriod(list,12)
  const { RSI: RSI3 } = getRSIByPeriod(list,24)

  const result = {
    time: moment(parseInt(time)).format("YYYY-MM-DD HH:mm:ss"),
    price,
    RSI1,
    RSI2,
    RSI3
  }
  return result
}
