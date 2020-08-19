import React from 'react';
import dashboard from '../views/dashboard/router';
import user from '../views/user/router';
import pages from '../views/pages/router';
import errorBoundary from '../views/errorBoundary/router';
import auth from '../views/auth/router';

import use from '../views/use/router';

import functional from '../views/functional/router';

import style from '../views/style/router';

import playground from '../views/playground/router';

import {fetchUserInfo} from '../api';

const childRouters=[dashboard,pages,...user,...errorBoundary,...auth,use,functional,style,playground];

const initPath='/dashboard';

const routers=[
  {
    url:'/',
    redirect:initPath,
    component:()=>import('../layout/frame'),
    resolve:{
      user:fetchUserInfo,
    },
    getMenus:true,
    frameTheme:'dark',
    children:childRouters,
  },
  {
    url:'/sign',
    name:'登录',
    title:'登录',
    component:<div>user</div>,
    hideMenu:true,
    children:[
      {
        url:'/signin',
        name:'登录',
        component:<h1>登录</h1>,
      },
      {
        url:'/signup',
        name:'注册',
        component:()=><h1>注册</h1>,
      },
    ],
  },
  {
    url:'/404',
    name:'404',
    component:import('../views/404'),
    hideMenu:true,
  },
];

export default routers;





















