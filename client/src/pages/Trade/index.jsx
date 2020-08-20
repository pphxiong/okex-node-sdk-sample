import React,{ useState, useEffect } from 'react';
import { Button, InputNumber } from 'antd';
import { postLeverage } from './api'

export default props => {
  const [leverage, setLeverage] = useState(10);
  const onSetLeverage = async () => {
    const result = await postLeverage({ underlying: 'BTC-USDT' })
    console.log(result)
  }
  return <>
    <span>设置杠杆倍数</span><InputNumber value={leverage} step={1} onChange={v=>setLeverage(v)}/>
  <Button onClick={()=>onSetLeverage()}>确定</Button>
  </>
}
