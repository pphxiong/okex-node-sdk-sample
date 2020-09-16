import React,{ useState, useEffect, useRef } from 'react';
import { Button, InputNumber, Card, message, Divider, Popconfirm, Row, Col, Radio } from 'antd';
import {
  postFuturesLeverage,
  postSwapLeverage,
  postFuturesOrder,
  getSwapAccount,
  getFuturesPosition,
  getFuturesLeverage,
  startMonitor,
  stopMonitor,
  changeMode,
  getFuturesAccounts,
  getFuturesMarkPrice,
  autoCloseOrderByInstrumentId,
  setFrequencyApi
} from './api'
import moment from 'moment'

export default props => {
  const [leverage, setLeverage] = useState(10);
  const [swapLeverage, setSwapLeverage] = useState(5);
  const [size, setSize] = useState(1);
  const [btcPosition, setBtcPosition] = useState({});
  const [eosPosition, setEosPosition] = useState({});
  const [btcAccount, setBtcAccount] = useState({});
  const [eosAccount, setEosAccount] = useState({});
  const [btcMarkPrice, setBtcMarkPrice] = useState(0);
  const [eosMarkPrice, setEosMarkPrice] = useState(0);
  const [position, setPosition] = useState(0.5);
  const [frequency, setFrequency] = useState(1);

  const getPosition = async () => {
    const result = await getFuturesPosition({instrument_id: 'BTC-USD-201225'});
    setBtcPosition(result?.data?.holding[0]);
    const eosResult = await getFuturesPosition({instrument_id: 'EOS-USD-201225'});
    setEosPosition(eosResult?.data?.holding[0]);
  }

  const getLeverage = async () => {
    const { data: result } = await getFuturesLeverage({ underlying: 'BTC-USD' });
    setLeverage(result['BTC-USD-201225']['long_leverage']);
  }

  const getAccounts = async () => {
    const result = await getFuturesAccounts({ currency: 'BTC-USD' });
    setBtcAccount(result?.data??{})
    const eosResult = await getFuturesAccounts({ currency: 'EOS-USD' });
    setEosAccount(eosResult?.data??{})
  }

  const getMarkPrice = async () => {
    const result = await getFuturesMarkPrice({ instrument_id: 'BTC-USD-201225' });
    setBtcMarkPrice(result?.data?.mark_price)
    const eosResult = await getFuturesMarkPrice({ instrument_id: 'EOS-USD-201225' });
    setEosMarkPrice(eosResult?.data?.mark_price)
  }

  const onSetFrequency = async (value) => {
    setFrequency(value);
    const { errcode, errmsg } = await setFrequencyApi({ frequency: value });
    if(errcode == 0)  message.success(errmsg);
  }

  useEffect(()=>{
    getPosition();
    getLeverage();
    getAccounts();
    getMarkPrice();
  },[])

  const onSetLeverage = async () => {
    const result = await postFuturesLeverage({ underlying: 'BTC-USD', leverage, instrument_id: 'BTC-USD-201225', direction: 'long' })
    // const result = await postFuturesLeverage({ underlying: 'BTC-USD', leverage });
    const data = result?.data;
    await postFuturesLeverage({ underlying: 'BTC-USD', leverage, instrument_id: 'BTC-USD-201225', direction: 'short' })
    if(data) message.success('BTC杠杆设置成功');
    setTimeout(async ()=>{
      const eosResult = await postFuturesLeverage({ underlying: 'EOS-USD', leverage, instrument_id: 'EOS-USD-201225', direction: 'long' });
      const eosData = eosResult?.data;
      await postFuturesLeverage({ underlying: 'EOS-USD', leverage, instrument_id: 'EOS-USD-201225', direction: 'short' });
      if(eosData) message.success('EOS杠杆设置成功');
    },1000);
  }
  //
  // const onSetSwapLeverage = async () => {
  //   const result = await postSwapLeverage({ instrument_id: 'BTC-USD-SWAP', leverage: swapLeverage, side: 3 })
  //   const data = result?.data;
  //   if(data) message.success('设置成功')
  // }

  const openOrders = async (btcType = 1, eosType = 2) => {
    // btc
    const payload = {
      size,
      type: btcType,
      order_type: 0, //1：只做Maker 4：市价委托
      price: btcMarkPrice,
      instrument_id: 'BTC-USD-201225',
      match_price: 0
    }
    const result = await postFuturesOrder(payload);
    console.log(result)
    if(result?.data?.result) message.success('BTC开多仓成功');
    // eos
    const eosPayload = {
      size: size * 10,
      type: eosType,
      order_type: 0, //1：只做Maker 4：市价委托
      price: eosMarkPrice,
      instrument_id: 'EOS-USD-201225',
      match_price: 0
    }
    const eosResult = await postFuturesOrder(eosPayload);
    console.log(eosResult)
    if(eosResult?.data?.result) message.success('EOS开空仓成功');
  }

  const openSameOrders = async type => {
    // btc
    const payload = {
      size,
      type,
      order_type: 0, //1：只做Maker 4：市价委托
      price: btcMarkPrice,
      instrument_id: 'BTC-USD-201225',
      match_price: 0
    }
    const result = await postFuturesOrder(payload);
    console.log(result)
    if(result?.data?.result) message.success('BTC开仓成功');
    // eos
    const eosPayload = {
      size: size * 10,
      type,
      order_type: 0, //1：只做Maker 4：市价委托
      price: eosMarkPrice,
      instrument_id: 'EOS-USD-201225',
      match_price: 0
    }
    const eosResult = await postFuturesOrder(eosPayload);
    console.log(eosResult)
    if(eosResult?.data?.result) message.success('EOS开仓成功');
  }

  const closeOrder = async () => {
    // btc
    const payload = {
      size,
      type: Number(btcPosition.long_avail_qty) ? 3 : 4,
      order_type: 0, //1：只做Maker 4：市价委托
      price: btcMarkPrice,
      instrument_id: btcPosition.instrument_id,
      match_price: 0
    }
    const result = await postFuturesOrder(payload);
    console.log(result)
    if(result?.data?.result) message.success('BTC平仓成功');
    // eos
    const eosPayload = {
      size: size * 10,
      type: Number(eosPosition.long_avail_qty) ? 3 : 4,
      order_type: 0, //1：只做Maker 4：市价委托
      price: eosMarkPrice,
      instrument_id: eosPosition.instrument_id,
      match_price: 0
    }
    const eosResult = await postFuturesOrder(eosPayload);
    console.log(eosResult)
    if(eosResult?.data?.result) message.success('EOS平仓成功');
  }

  const closeOrderByMarkPrice = async () => {
    const result = await autoCloseOrderByInstrumentId({ instrument_id: btcPosition.instrument_id, direction: Number(btcPosition.long_avail_qty) ? 'long' : 'short'})
    if(result?.data?.result) message.success('btc平仓成功')

    const eosResult = await autoCloseOrderByInstrumentId({ instrument_id: eosPosition.instrument_id, direction: Number(eosPosition.long_avail_qty) ? 'long' : 'short'})
    if(eosResult?.data?.result) message.success('eos平仓成功')
  }

  const onStopMonitor = async () => {
    const { errcode, errmsg } = await stopMonitor();
    if(errcode == 0)  message.success(errmsg);
  }

  const onStartMonitor = async () => {
    const { errcode, errmsg } = await startMonitor();
    if(errcode == 0)  message.success(errmsg);
  }

  const onChangeMode = async (mode = 1) => {
    console.log(mode)
    const { errcode, errmsg } = await changeMode({ mode });
    if(errcode == 0)  message.success(errmsg);
  }

  // 共计收益
  const pnl = (Number(btcPosition.long_pnl)+Number(btcPosition.short_pnl)) * Number(btcPosition.last) + (Number(eosPosition.long_pnl)+Number(eosPosition.short_pnl)) * Number(eosPosition.last);
  // 共计保证金
  const margin = (Number(btcPosition.long_margin)+Number(btcPosition.short_margin)) * Number(btcPosition.last) + (Number(eosPosition.long_margin)+Number(eosPosition.short_margin)) * Number(eosPosition.last);

  // btc余额
  const { equity, contracts = [{}], total_avail_balance } = btcAccount;
  const { margin_frozen, margin_for_unfilled } = contracts[0];
  const available_qty = Number(equity) - Number(margin_frozen) - Number(margin_for_unfilled);

  // eos余额
  const { equity: eosEquity, contracts: eosContracts = [{}], total_avail_balance: eos_total_avail_balance } = eosAccount;
  const { margin_frozen: eos_margin_frozen, margin_for_unfilled: eos_margin_for_unfilled } = eosContracts[0];
  const eos_available_qty = Number(eosEquity) - Number(eos_margin_frozen) - Number(eos_margin_for_unfilled);

  return <>
    <Card title="持仓情况" extra={<Button onClick={()=>getPosition()}>刷新</Button>}>
      <Row gutter={12}>
        <Col span={12}>
          <h3>BTC</h3>
          <p>ID：{btcPosition.instrument_id}</p>
          {/*<p>成交时间：{moment(btcPosition.created_at).format('YYYY-MM-DD hh:mm:ss')}</p>*/}
          <p>更新时间：{moment(btcPosition.updated_at).format('YYYY-MM-DD HH:mm:ss')}</p>
          <p>杠杆倍数：{btcPosition.long_leverage}</p>
          <p>数量（张）：多 {btcPosition.long_qty} 空 {btcPosition.short_qty}</p>
          <p>开仓均价：{btcPosition.long_avg_cost}</p>
          <p>最新成交价（美元）：{btcPosition.last}</p>
          <p>多仓保证金(BTC)：{btcPosition.long_margin}</p>
          <p>多仓收益(BTC)：{btcPosition.long_pnl}</p>
          <p>多仓收益率（%）：{Number(btcPosition.long_margin) && (Number(btcPosition.long_unrealised_pnl) / Number(btcPosition.long_margin) * 100)}</p>
          <p>空仓保证金（BTC)：{btcPosition.short_margin}</p>
          <p>空仓收益（BTC)：{btcPosition.short_pnl}</p>
          <p>空仓收益率（%）：{Number(btcPosition.short_margin) && (Number(btcPosition.short_unrealised_pnl) / Number(btcPosition.short_margin) * 100)}</p>
          <p>已实现盈余：{btcPosition.realised_pnl}</p>
          <p>保证金折合（美元）：{Number(btcPosition.long_margin) * Number(btcPosition.last)}</p>
          <p>收益折合（美元）：{Number(btcPosition.long_pnl) * Number(btcPosition.last)}</p>
          <p>已实现盈余折合（美元）：{Number(btcPosition.realised_pnl) * Number(btcPosition.last)}</p>
        </Col>
        <Col span={12}>
          <h3>EOS</h3>
          <p>ID：{eosPosition.instrument_id}</p>
          {/*<p>成交时间：{moment(eosPosition.created_at).format('YYYY-MM-DD hh:mm:ss')}</p>*/}
          <p>更新时间：{moment(eosPosition.updated_at).format('YYYY-MM-DD HH:mm:ss')}</p>
          <p>杠杆倍数：{eosPosition.long_leverage}</p>
          <p>数量（张）：多 {eosPosition.long_qty} 空 {eosPosition.short_qty}</p>
          <p>开仓均价：{eosPosition.short_avg_cost}</p>
          <p>最新成交价（美元）：{eosPosition.last}</p>
          <p>多仓保证金(EOS)：{eosPosition.long_margin}</p>
          <p>多仓收益(EOS)：{eosPosition.long_pnl}</p>
          <p>多仓收益率（%）：{Number(eosPosition.long_margin) && (Number(eosPosition.long_unrealised_pnl) / Number(eosPosition.long_margin) * 100)}</p>
          <p>空仓保证金（EOS)：{eosPosition.short_margin}</p>
          <p>空仓收益（EOS)：{eosPosition.short_pnl}</p>
          <p>空仓收益率（%）：{Number(btcPosition.short_margin) && (Number(btcPosition.short_unrealised_pnl) / Number(btcPosition.short_margin) * 100)}</p>
          <p>已实现盈余：{eosPosition.realised_pnl}</p>
          <p>保证金折合（美元）：{(Number(eosPosition.short_margin) + Number(eosPosition.long_margin)) * Number(eosPosition.last)}</p>
          <p>收益折合（美元）：{Number(eosPosition.short_pnl) * Number(eosPosition.last)}</p>
          <p>已实现盈余折合（美元）：{Number(eosPosition.realised_pnl) * Number(eosPosition.last)}</p>
        </Col>
      </Row>
      <Divider />
      <Row>
        <Col span={24}>
          <h3>共计</h3>
          <p>收益（美元）：{pnl}</p>
          <p>收益率（%）：{pnl/margin*100}</p>
          <p>已实现盈余（美元）：{Number(btcPosition.realised_pnl) * Number(btcPosition.last) + Number(eosPosition.realised_pnl) * Number(eosPosition.last)}</p>
        </Col>
      </Row>
    </Card>
    <Card title={'合约账户信息'} style={{ marginTop: 10 }}>
      <p>
        BTC余额：{total_avail_balance}
        <Divider type="vertical" />
        标记价格：{btcMarkPrice}
        <Divider type="vertical" />
        可开张数：{ Math.floor(Number(total_avail_balance) * Number(btcMarkPrice) * leverage * 0.98 / 100) }
      </p>
      <p>
        EOS余额：{eos_total_avail_balance}
        <Divider type="vertical" />
        标记价格：{eosMarkPrice}
        <Divider type="vertical" />
        可开张数：{ Math.floor(Number(eos_total_avail_balance) * Number(eosMarkPrice) * leverage * 0.98 / 10) }
      </p>
    </Card>
    <Card title={'交割合约'} style={{ marginTop: 10 }}>
      <span>设置杠杆倍数：</span><InputNumber value={leverage} step={1} min={1} max={100} onChange={v=>setLeverage(v)}/>
      <Divider type="vertical" />
      <span>开仓张数：</span><InputNumber value={size} step={1} min={1} onChange={v=>setSize(v)}/>
      <Button onClick={()=>onSetLeverage()} type={'primary'} style={{ marginLeft: 10 }}>确定</Button>

      <Divider type="horizontal" />

      <span>操作：</span>
      <p>下单模式：
        <Radio.Group defaultValue="1" buttonStyle="solid" onChange={e=>onChangeMode(e.target.value)}>
          <Radio.Button value="1">模式1</Radio.Button>
          <Radio.Button value="2">模式2</Radio.Button>
        </Radio.Group>
      </p>
      {/*<p>开仓仓位：*/}
      {/*  <Radio.Group defaultValue={position} buttonStyle="solid" onChange={e=>setPosition(e.target.value)}>*/}
      {/*    <Radio.Button value={0.5}>半仓</Radio.Button>*/}
      {/*    <Radio.Button value={1}>全仓</Radio.Button>*/}
      {/*  </Radio.Group>*/}
      {/*</p>*/}
      <p>交易频次：
        <InputNumber value={frequency} step={0.1} min={0.1} onChange={v=>onSetFrequency(v)}/>
      </p>
      <Divider type="horizontal" />

      <Button onClick={()=>onStopMonitor()}>停止监控</Button>
      <Button onClick={()=>onStartMonitor()} type="primary" style={{ marginLeft: 10 }}>开始监控</Button>

      <Divider type="horizontal" />

      <Popconfirm
        title="是否确定开btc多仓，eos空仓？"
        onConfirm={()=>openOrders(1,2)}
      >
        <Button>对冲开仓</Button>
      </Popconfirm>

      <Popconfirm
        title="是否确定开btc空仓，eos多仓？"
        onConfirm={()=>openOrders(2,1)}
      >
        <Button style={{ marginLeft: 10 }}>反向对冲</Button>
      </Popconfirm>

      <Popconfirm
        title="是否确定开btc多仓，eos多仓？"
        onConfirm={()=>openSameOrders(1)}
      >
        <Button style={{ marginLeft: 10 }}>双多开仓</Button>
      </Popconfirm>

      <Popconfirm
        title="是否确定开btc空仓，eos空仓？"
        onConfirm={()=>openSameOrders(2)}
      >
        <Button style={{ marginLeft: 10 }}>双空开仓</Button>
      </Popconfirm>

      <Popconfirm
        title="是否确定要全部平仓？"
        onConfirm={()=>closeOrder()}
      >
        <Button type="primary" style={{ marginLeft: 10 }}>全平</Button>
      </Popconfirm>

      <Popconfirm
        title="是否确定要市价全平？"
        onConfirm={()=>closeOrderByMarkPrice()}
      >
        <Button type="primary" style={{ marginLeft: 10 }}>市价全平</Button>
      </Popconfirm>

    </Card>
    {/*<Card title={'永续合约'} style={{ marginTop: 10 }}>*/}
    {/*  <span>设置杠杆倍数：</span><InputNumber value={swapLeverage} step={1} onChange={v=>setSwapLeverage(v)}/>*/}
    {/*  <Button onClick={()=>onSetSwapLeverage()} type={'primary'} style={{ marginLeft: 10 }}>确定</Button>*/}

    {/*  <Divider type="horizontal" />*/}

    {/*  <Popconfirm*/}
    {/*    title="是否确定以市价开仓？"*/}
    {/*    onConfirm={()=>openOrder()}*/}
    {/*    >*/}
    {/*    <Button>对冲开仓</Button>*/}
    {/*  </Popconfirm>*/}

    {/*  <Popconfirm*/}
    {/*    title="是否确定要全部平仓？"*/}
    {/*    onConfirm={()=>closeOrder()}*/}
    {/*  >*/}
    {/*    <Button type="primary" style={{ marginLeft: 10 }}>全平</Button>*/}
    {/*  </Popconfirm>*/}

    {/*</Card>*/}
  </>
}
