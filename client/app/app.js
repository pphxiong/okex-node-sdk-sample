import {useEffect} from 'react';
import {useRouter} from '@app/configs';
import routers from './router';

import configs from './configs';

const App=()=>{
  const {components,updateRouter,menu}=useRouter({routers,...configs});
  /* useEffect(()=>{
    setTimeout(()=>{
      updateRouter(prev=>{
        console.log(prev);
        return {
          ...prev,
          browserRouter:true,
        };
      });
    },2000);
  },[]); */
  // console.log(111,menu);
  return components??null;
};

export default App;


