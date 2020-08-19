const router={
  url:'/style',
  redirect:'/style/anicon',
  name:'style',
  icon:'icon-boat',
  children:[
    {
      url:'/anicon',
      name:'anicon',
      icon:'icon-th-list',
      component:()=>import('./anicon'),
    },
    {
      url:'/icons',
      name:'icons',
      icon:'ico-block',
      component:()=>import('./icons'),
    },
  ],
};
export default router;