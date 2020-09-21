import React,{ useState, useEffect, useRef } from 'react';
import { Button, InputNumber, Card, message, Divider, Popconfirm, Row, Col, Radio, Tabs } from 'antd';
import {
  postFuturesLeverage,
  postFuturesOrder,
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

const BTC_INSTRUMENT_ID = 'BTC-USD-201225';
const EOS_INSTRUMENT_ID = 'EOS-USD-201225';

export default props => {
  const [btcLeverage, setBtcLeverage] = useState(10);
  const [eosLeverage, setEosLeverage] = useState(10);
  const [size, setSize] = useState(1);
  const [btcPosition, setBtcPosition] = useState({});
  const [eosPosition, setEosPosition] = useState({});
  const [btcAccount, setBtcAccount] = useState({});
  const [eosAccount, setEosAccount] = useState({});
  const [btcMarkPrice, setBtcMarkPrice] = useState(0);
  const [eosMarkPrice, setEosMarkPrice] = useState(0);
  const [position, setPosition] = useState(0.5);
  const [frequency, setFrequency] = useState(0.5);
  const [currentInstrumentId, setCurrentInstrumentId] = useState(BTC_INSTRUMENT_ID);

  const getPosition = async () => {
    const result = await getFuturesPosition({instrument_id: BTC_INSTRUMENT_ID});
    setBtcPosition(result?.data?.holding[0]);
    const eosResult = await getFuturesPosition({instrument_id: EOS_INSTRUMENT_ID});
    setEosPosition(eosResult?.data?.holding[0]);
  }

  const getLeverage = async () => {
    const { data: result } = await getFuturesLeverage({ underlying: 'BTC-USD' });
    setBtcLeverage(result[BTC_INSTRUMENT_ID]['long_leverage']);
    const { data: eosResult } = await getFuturesLeverage({ underlying: 'EOS-USD' });
    setEosLeverage(eosResult[EOS_INSTRUMENT_ID]['long_leverage']);
  }

  const getAccounts = async () => {
    const result = await getFuturesAccounts({ currency: 'BTC-USD' });
    setBtcAccount(result?.data??{})
    const eosResult = await getFuturesAccounts({ currency: 'EOS-USD' });
    setEosAccount(eosResult?.data??{})
  }

  const getMarkPrice = async () => {
    const result = await getFuturesMarkPrice({ instrument_id: BTC_INSTRUMENT_ID });
    setBtcMarkPrice(result?.data?.mark_price)
    const eosResult = await getFuturesMarkPrice({ instrument_id: EOS_INSTRUMENT_ID });
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

  const onSetLeverage = async ({ underlying, leverage, instrument_id, currency }) => {
    const result = await postFuturesLeverage({ underlying, leverage, instrument_id, direction: 'long' })
    // const result = await postFuturesLeverage({ underlying: 'BTC-USD', leverage });
    const data = result?.data;
    await postFuturesLeverage({ underlying, leverage, instrument_id, direction: 'short' })
    if(data) message.success(`${currency}杠杆设置成功`);
  }

  const openOrder = async (type, currency) => {
    const payload = {
      size,
      type: type,
      order_type: 0, //1：只做Maker 4：市价委托
      price: currency == 'BTC' ? btcMarkPrice : eosMarkPrice,
      instrument_id: currentInstrumentId,
      match_price: 0
    }
    const result = await postFuturesOrder(payload);
    console.log(result)
    if(result?.data?.result) message.success(`${currency}开仓成功`);
  }

  const openSameOrders = async type => {
    // btc
    const payload = {
      size,
      type,
      order_type: 0, //1：只做Maker 4：市价委托
      price: btcMarkPrice,
      instrument_id: BTC_INSTRUMENT_ID,
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
      instrument_id: EOS_INSTRUMENT_ID,
      match_price: 0
    }
    const eosResult = await postFuturesOrder(eosPayload);
    console.log(eosResult)
    if(eosResult?.data?.result) message.success('EOS开仓成功');
  }

  const closeOrder = async (currency) => {
    const position = currency == 'BTC' ? btcPosition : eosPosition;
    const price = currency == 'BTC' ? btcMarkPrice : eosMarkPrice;
    if(Number(position.long_avail_qty) || Number(position.short_avail_qty)) {
      const payload = {
        size: Number(position.long_avail_qty) || Number(position.short_avail_qty),
        type: Number(position.long_avail_qty) ? 3 : 4,
        order_type: 0, //1：只做Maker 4：市价委托
        price,
        instrument_id: position.instrument_id,
        match_price: 0
      }
      const result = await postFuturesOrder(payload);
      console.log(result)
      if(result?.data?.result) message.success(`${currency}平仓挂单成功`);
    }
  }

  const closeOrderByMarkPrice = async (currency) => {
    const position = currency == 'BTC' ? btcPosition : eosPosition;
    const result = await autoCloseOrderByInstrumentId({ instrument_id: position.instrument_id, direction: Number(position.long_avail_qty) ? 'long' : 'short'})
    if(result?.data?.result) message.success(`${currency}平仓成功`)
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

  const OrderPanelC = ({ currency, instrument_id, underlying, leverage }) => (<>
    <span>设置杠杆倍数：</span>
    <InputNumber
      value={ currency == 'BTC' ? btcLeverage : eosLeverage }
      step={1}
      min={1}
      max={100}
      onChange={v=> {
        currency == 'BTC' ? setBtcLeverage(v) : setEosLeverage(v)
      }}
    />
    <Divider type="vertical" />
    <span>开仓张数：</span><InputNumber value={size} step={1} min={1} onChange={v=>setSize(v)}/>
    <Button onClick={()=>onSetLeverage({ currency, instrument_id, underlying, leverage })} type={'primary'} style={{ marginLeft: 10 }}>确定</Button>

    <Divider type="horizontal" />

    <Popconfirm
      title={`是否确定开${currency}多仓？`}
      onConfirm={()=>openOrder(1, currency)}
    >
      <Button>开多</Button>
    </Popconfirm>

    <Popconfirm
      title={`是否确定开${currency}空仓？`}
      onConfirm={()=>openOrder(2, currency)}
    >
      <Button style={{ marginLeft: 10 }}>开空</Button>
    </Popconfirm>

    <Popconfirm
      title={`是否确定要${currency}平仓？`}
      onConfirm={()=>closeOrder(currency)}
    >
      <Button type="primary" style={{ marginLeft: 10 }}>平仓</Button>
    </Popconfirm>

    <Popconfirm
      title={`是否确定要${currency}市价平仓？`}
      onConfirm={()=>closeOrderByMarkPrice(currency)}
    >
      <Button type="primary" style={{ marginLeft: 10 }}>市价平仓</Button>
    </Popconfirm>
  </>)

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
        可开张数：{ Math.floor(Number(total_avail_balance) * Number(btcMarkPrice) * btcLeverage * 0.98 / 100) }
      </p>
      <p>
        EOS余额：{eos_total_avail_balance}
        <Divider type="vertical" />
        标记价格：{eosMarkPrice}
        <Divider type="vertical" />
        可开张数：{ Math.floor(Number(eos_total_avail_balance) * Number(eosMarkPrice) * eosLeverage * 0.98 / 10) }
      </p>
    </Card>
    <Card title={'交割合约'} style={{ marginTop: 10 }}>
      <Tabs defaultActiveKey={BTC_INSTRUMENT_ID} onChange={key=>setCurrentInstrumentId(key)}>
        <Tabs.TabPane tab="BTC" key={BTC_INSTRUMENT_ID}>
          <OrderPanelC instrument_id={BTC_INSTRUMENT_ID} currency={"BTC"} underlying={"BTC-USD"} leverage={btcLeverage} />
        </Tabs.TabPane>
        <Tabs.TabPane tab="EOS" key={EOS_INSTRUMENT_ID}>
          <OrderPanelC instrument_id={EOS_INSTRUMENT_ID} currency={"EOS"} underlying={"EOS-USD"} leverage={eosLeverage} />
        </Tabs.TabPane>
      </Tabs>
    </Card>
    <Card title={'操作'} style={{ marginTop: 10 }}>
      {/*<p>下单模式：*/}
      {/*  <Radio.Group defaultValue="1" buttonStyle="solid" onChange={e=>onChangeMode(e.target.value)}>*/}
      {/*    <Radio.Button value="1">模式1</Radio.Button>*/}
      {/*    <Radio.Button value="2">模式2</Radio.Button>*/}
      {/*  </Radio.Group>*/}
      {/*</p>*/}
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
    </Card>
  </>
}
