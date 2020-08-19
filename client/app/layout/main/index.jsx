import React from 'react';

import {Link} from '@app/configs';

import Menu from '../menu';

import './index.less';

import styles from './index.less';

export const breadcrumb=current=><div className="breadcrumb">
  <ul>
    {/* <li><Link path="/">home</Link></li> */}
    {current.filter(v=>v.name).map(v=>v.url!=='/'&&<li key={v.url}><Link path={v.url}>{v.name}</Link></li>)}
  </ul>
</div>;

const Main=props=>{
  const {data,showMenu}=props;
  const {menu,current,children}=data;
  // console.log(333,showMenu);
  return <div className="frame-container">
    <aside className={`frame-aside${showMenu}`}>
      <Menu menu={menu} />
    </aside>
    <div className={`frame-view${showMenu}`}>
      <div className="container">
        {breadcrumb(current)}
        <div className={styles.content}>
          {children}
        </div>
      </div>
    </div>
  </div>;
};


export default Main;



































