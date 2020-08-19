import React,{Suspense,useState,useEffect,useRef} from 'react';

import {data} from './config';

// import {Link} from '@huxy/router';
import {Link} from '@app/configs';

import Spinner from '@app/components/spinner';

import watermark from '@common/utils/watermark';

import './index.less';

const columns=[
  {
    key:'name',
    text:'昵称',
  },
  {
    key:'age',
    text:'年龄',
  },
  {
    key:'email',
    text:'邮箱',
  },
  {
    key:'addr',
    text:'地址',
  },
  {
    key:'detail',
    text:'详情',
  },
];

const Index=props=>{
  const users=props.users?.data||[];
  const pageRef=useRef();
  useEffect(()=>{
    console.log(333,pageRef);
    watermark({container:pageRef.current});
  },[]);
  return <div className="page" ref={pageRef} >
    <div>
      {
        users?.length?
          <table className="ytable">
            <thead>
              <tr>
                {
                  columns.map(v=><th key={v.key}>{v.text}</th>)
                }
              </tr>
            </thead>
            <tbody>
              {
                users.map(v=><tr key={v.name}>
                  {columns.map(sv=><td key={`${v.name}-${sv.key}`}>{v[sv.key]||<Link path={`/user/${v.id}`}>{sv.text}</Link>}</td>)}
                </tr>)
              }
            </tbody>
          </table>:
          <Spinner />
      }
    </div>
  </div>;
};

export default Index;

















