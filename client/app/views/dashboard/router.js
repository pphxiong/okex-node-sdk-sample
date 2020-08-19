import {fetchUser} from './api';
const router={
  url:'/dashboard',
  redirect:'/dashboard/app1',
  name:'Dashboard',
  icon:'icon-dashboard',
  children:[
    {
      url:'/app1',
      name:'app1',
      icon:'icon-th-list',
      component:()=>import('./app1'),
      /* resolve:{
        user:fetchUser,
      }, */
    },
    {
      url:'/app2',
      name:'app2',
      icon:'icon-th-list',
      component:()=>import('./app2'),
    },
    {
      url:'/app3',
      name:'app3',
      icon:'icon-th-list',
      component:()=>import('./app3'),
      resolve:{
        user:fetchUser,
      },
    },
    {
      url:'/app4',
      name:'admin',
      icon:'icon-th-list',
      component:()=>import('./app4'),
    },
  ],
};
export default router;