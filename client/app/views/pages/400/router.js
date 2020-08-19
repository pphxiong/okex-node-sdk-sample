const router=[
  {
    url:'/401',
    name:'401',
    icon:'icon-sign-in',
    component:()=>import('./401'),
  },
  {
    url:'/403',
    name:'403',
    icon:'icon-sign-in',
    component:()=>import('./403'),
  },
  {
    url:'/404',
    name:'404',
    icon:'icon-sign-in',
    component:()=>import('./404'),
  },
];
export default router;