const router={
  url:'/use',
  redirect:'/use/fetch',
  name:'use',
  icon:'icon-sitemap',
  children:[
    {
      url:'/fetch',
      name:'useFetch',
      icon:'icon-th-list',
      component:()=>import('./fetch'),
    },
    {
      url:'/search',
      name:'useSearch',
      icon:'icon-th-list',
      component:()=>import('./search'),
    },
    {
      url:'/viewSize',
      name:'useViewSize',
      icon:'icon-th-list',
      component:()=>import('./viewSize'),
    },

    {
      url:'/eleResize',
      name:'useEleSize',
      icon:'icon-th-list',
      component:()=>import('./viewSize/eleResize'),
    },
    {
      url:'/style',
      name:'useStyle',
      icon:'icon-th-list',
      // denied:true,
      component:()=>import('./style'),
    },
    {
      url:'/message',
      name:'useMessage',
      icon:'icon-th-list',
      component:()=>import('./message'),
    },
  ],
};
export default router;