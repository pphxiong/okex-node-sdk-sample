import React,{ useState, useEffect } from 'react';
import { Button, InputNumber, Card } from 'antd';
import { postLeverage, postSwapLeverage } from './api'

export default props => {
  const [leverage, setLeverage] = useState(10);
  const [swapLeverage, setSwapLeverage] = useState(5);

  const onSetLeverage = async () => {
    const result = await postLeverage({ underlying: 'BTC-USDT', leverage, instrument_id: 'BTC-USDT-200821', direction: 'long' })
    console.log(result)
  }

  const onSetSwapLeverage = async () => {
    const result = await postSwapLeverage({ instrument_id: 'BTC-USD-SWAP', leverage: swapLeverage, side: 3 })
    console.log(result)
  }

  return <>
    <Card title={'交割合约'}>
      <span>设置杠杆倍数：</span><InputNumber value={leverage} step={1} onChange={v=>setLeverage(v)}/>
      <Button onClick={()=>onSetLeverage()}>确定</Button>
    </Card>
    <Card title={'永续合约'} style={{ marginTop: 10 }}>
      <span>设置杠杆倍数：</span><InputNumber value={swapLeverage} step={1} onChange={v=>setSwapLeverage(v)}/>
      <Button onClick={()=>onSetSwapLeverage()}>确定</Button>
    </Card>
  </>
}
