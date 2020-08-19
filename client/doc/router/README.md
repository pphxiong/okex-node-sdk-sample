## useRouter

### 根据popstate、hashchange监听路由变化，

    const historyEvent=browserRouter?'popstate':'hashchange';
    const changeEvent=()=>changeRouter();
    window.addEventListener(historyEvent,changeEvent,false);

### 路由切换。history.pushState history.replaceState

	const historyEvents=(path,params,event='pushState')=>{
	  history[event]({route:path},null,path);
	  changeRouter(path,params);
	};
	const push=({path,params})=>{
	  historyEvents(path,params);
	};
	const replace=({path,params})=>{
	  historyEvents(path,params,'replaceState');
	};

### 根据当前路由找到对应components

	const formatMenu=(router,path,params)=>{
	  const {result,current}=getCurrent(router,path,params);
	  const menu=filterMenu(result);
	  return {
	    current,
	    menu,
	  };
	};

### lazyload components

	const loader=async props=>{
	  let component=await props.component;
	  component=component.default??res;
	  return component;
	};

### fetch data

	const fetchData=async ()=>{
	  try{
	    const result=await resolve(params);
	    setPropsResolve(result);
	  }catch(err){
	    setPropsResolve(err);
	  }
	};


### errorBoundary

	export default class ErrorBoundary extends React.Component{
	  state={
	    error:null,
	  };
	  static getDerivedStateFromError(error){
	    return {error};
	  }
	  render(){
	    const {error}=this.state;
	    const {fallback,children}=this.props;
	    if(error){
	      return fallback(error);
	    }
	    return children;
	  }
	}

	<ErrorBoundary>
	  <Suspense fallback={handleLoading(Loading)}>
	    {comp}
	  </Suspense>
	</ErrorBoundary>


### Link

	const Link=props=>{
	  const {path,params,children,...rest}=props;
	  const handleClick=e=>{
	    e.preventDefault();
	    emit(pushEvent,{path,params});
	  };
	  return <a onClick={e=>handleClick(e)} href={path} {...rest}>{children}</a>;
	};


## 配置示例

### install

	npm i @huxy/router

### 使用

	const App=()=>{
	  const {components}=useRouter(yourConfigs);
	  return components??null;
	};

### 配置

#### 全局配置

	const browserRouter=!process.env.isDev;
	const idKey='url';
	const title='项目管理平台';
	const theme='dark';
	let whiteList=['/dashboard/app4'];
	whiteList=browserRouter?whiteList:whiteList.map(v=>`#${v}`);
	const beforeRender=input=>{
	  if(whiteList.includes(input.path)){
	    return {path:'/sign/signin'};
	  }
	};
	const afterRender=output=>{
	  console.log(output);
	};
	
	export default {
	  browserRouter,
	  idKey,
	  title,
	  theme,
	  beforeRender,
	  // afterRender,
	};

- browserRouter：是否为browserHistory
- idKey：路由key值。如：url
- childKey：子层级key值。如：children
- title：页面title。
- beforeRender：路由守卫，渲染前回调。
- afterRender：渲染完回调。
- theme：主题配置。
- others；其它设置。

#### 组件配置

	url:'/dashboard',
	redirect:'/dashboard/app1',
	name:'Dashboard',
	icon:'icon-dashboard',
	children:[
	  {
	    url:'/app1',
	    name:'app1',
	    icon:'icon-th-list',
	    component:<App1 />,
	    loadData:{
	      user:fetchUser,
	    },
	    errorBoundary:true,
	  },
	  {
	    url:'/app2',
	    name:'app2',
	    icon:'icon-th-list',
	    component:()=>import('./app2'),
	    denied:true,
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
	    component:<h1>app4</h1>,
	    hideMenu:false,
	  },
	]

- url：路径
- name：展示名
- icon：图表
- redirect：重定向
- children：子菜单
- component：页面
- denied：权限控制
- hideMenu：菜单隐藏展示
- errorBoundary：错误边界。默认有错误边界处理，可自定义。
- resolve：数据请求并缓存，可用store.getState(key)获取，store.setState(state)更新。
- loadData:数据请求，不缓存数据。

#### 工具函数

- store：提供数据全局管理功能。setState、getState
- eventBus：订阅发布功能。on、emit、off
- updateRouter：更新路由配置

### 示例

	const childRouters=[dashboard,...user,pages];

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

	const dashboard={
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
	  ],
	};

	const user=[
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

	const pages={
	  url:'/pages',
	  name:'页面管理',
	  title:'页面管理',
	  icon:'icon-desktop',
	  redirect:'/pages/400',
	  children:[
	    {
	      url:'/400',
	      name:'400',
	      icon:'icon-th-list',
	      redirect:'/pages/400/401',
	      children,
	    },
	    {
	      url:'/500',
	      name:'500',
	      icon:'icon-th-list',
	      component:()=>import('./500'),
	    },
	  ],
	};













