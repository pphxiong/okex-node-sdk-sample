import {fetchUsers,fetchUserSrc,fetchUserSrcList} from '@app/api';
const router=[
  {
    url:'/user',
    name:'用户管理',
    icon:'icon-id-card',
    component:()=>import('./user'),
    resolve:{
      users:fetchUsers,
    },
  },
  {
    url:'/user/:id',
    name:'src',
    icon:'icon-th-list',
    component:()=>import('./user/src'),
    resolve:{
      src:fetchUserSrc,
    },
  },
  {
    url:'/user/:id/:type',
    name:'srcList',
    icon:'icon-th-list',
    component:()=>import('./user/srcList'),
    resolve:{
      srcList:fetchUserSrcList,
    },
  },
];
export default router;