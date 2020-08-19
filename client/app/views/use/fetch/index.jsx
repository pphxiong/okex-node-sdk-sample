import React,{useEffect,useCallback} from 'react';
import useAsync from '@common/use/useAsync';
import {fetchUser,fetchUser1,fetchUser2,fetchTest1,fetchTest2} from './api';

import './index.less';

let id=0;

const testAsync=async ()=>{
  const test1=await fetchTest1();
  const test2=await fetchTest2(test1?.data);
  return test2;
};

const Index=props=>{
  const [user,setUser]=useAsync();
  const upUser=useCallback(()=>{
    setUser({result:fetchUser({id:id++})});
  },[]);
  const upUsers=useCallback(()=>{
    setUser({
      result1:fetchUser1({id:id++}),
      result2:fetchUser2({id:id++}),
    });
  },[]);
  useEffect(()=>{
    upUser();
    upUsers();
  },[]);
  useEffect(()=>{
    setUser({
      test:testAsync(),
    });
  },[]);
  const {result,result1,result2,test}=user||{};
  return <div className="page">
    <div>{test?.data?.msg??'no data'}</div>
    <div className="user">
      <button onClick={upUser}>update user</button>
      <p>
        <span>id：</span>
        {/* <span>{result?.data.id??'fetching...'}</span> */}
        <span>{result?.message??result?.data.id??'fetching...'}</span>
      </p>
      <p>
        <span>name：</span>
        <span>{result?.message??result?.data.name??'fetching...'}</span>
      </p>
    </div>
    <div className="users">
      <button onClick={upUsers}>update users</button>
      <p>
        <span>id：</span>
        <span>{result1?.data.id??'fetching...'}</span>
      </p>
      <p>
        <span>name：</span>
        <span>{result1?.data.name??'fetching...'}</span>
      </p>
      <p>
        <span>id：</span>
        <span>{result2?.data.id??'fetching...'}</span>
      </p>
      <p>
        <span>name：</span>
        <span>{result2?.data.name??'fetching...'}</span>
      </p>
    </div>
  </div>;
};

export default Index;

















