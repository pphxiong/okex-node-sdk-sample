import React, { useState, useEffect } from 'react';
import { Card, Divider, Button, DatePicker } from 'antd';
import SearchTable, { refreshTable } from '@/components/SearchTable';
import moment from "moment";
import { Line } from '@ant-design/charts';
import { getOrders, getSwapInformation, getSwapInformationSentiment, getTradeFee, getHistory, getSwapPosition } from './api';
import { tradeTypeEnum } from '../../config';
import lineConfig from '../../pageComponents/g2ChartConfigs/Line';

const { RangePicker } = DatePicker;

export default props => {
  const [longShortRatioData, setLongShortRatioData] = useState([]);
  const [sentimentData, setSentimentData] = useState([]);
  const [feeObj, setFeeObj] = useState({});
  const ordersLimit = 40;
  const [current,setCurrent] = useState(1);
  const [pageSize,setPageSize] = useState(10);
  const [eosCurrent,setEosCurrent] = useState(1);
  const [eosPageSize,setEosPageSize] = useState(10);

  const BTC_INSTRUMENT_ID = 'MNBTC-USD-SWAP';

  const initBTCData = async () => {
    const result = await getOrders({ instrument_id: BTC_INSTRUMENT_ID, limit: ordersLimit, state: 7 });
    return result;
  }

  const initEOSData = async () => {
    const result = await getOrders({ instrument_id: 'MNEOS-USD-SWAP', limit: ordersLimit, state: 7 });
    return result;
  }

  const getLongShortRatioData = async () => {
    const result = await getSwapInformation({ currency: 'BTC', granularity: 86400 * 10 });
    const data = result?.data??[];
    setLongShortRatioData(data.filter((_,index)=>index<40).map(item=>({ time: moment(item[0]).format('HH:mm:ss'), ratio: Number(item[1]) })));
  }

  const getSentiment = async () => {
    const result = await getSwapInformationSentiment({ currency: 'BTC', granularity: 86400 * 10 });
    const data = result?.data??[];
    const list = [];
    data.filter((_,index)=>index<40).map(item=>{
      list.push({
        time: moment(item[0]).format('HH:mm:ss'),
        ratio: Number(item[1]),
        type: '做多账户'
      });
      list.push({
        time: moment(item[0]).format('HH:mm:ss'),
        ratio: Number(item[2]),
        type: '做空账户'
      });
    })
    setSentimentData(list);
  }

  const getFee = async (params) => {
    const { data } = await getTradeFee(params);
    setFeeObj(data||{});
  }

  const continuousObj = {
    continuousLossNum: 0,
    continuousWinNum: 0,
  }

  let totalPnl = 0;
  let isCurrentSideShort = false;

  const testAutoOperateSwap = async (unrealized_pnl,ratio,condition, holding) => {
    const frequency = 0.6;

    // 盈利
    if(ratio > condition * 1.2 * 2 * frequency){
      totalPnl += unrealized_pnl;
      continuousObj.continuousLossNum = 0;
      continuousObj.continuousWinNum = continuousObj.continuousWinNum + 1;

      isCurrentSideShort = false;

      // 第3次盈利后反向
      if(continuousObj.continuousWinNum>2) {
        isCurrentSideShort = true;
        continuousObj.continuousWinNum = 0;
      }

      return;
    }
    // 亏损，平仓，市价全平
    if(ratio < - condition * frequency){
      totalPnl += unrealized_pnl;

      continuousObj.continuousLossNum = continuousObj.continuousLossNum + 1;
      continuousObj.continuousWinNum = 0;

      isCurrentSideShort = false;

      // 连续亏损3次，立即反向
      if(continuousObj.continuousLossNum>2) {
        isCurrentSideShort = true;
        continuousObj.continuousLossNum = 0;
      }
      setTimeout(async ()=>{
        await autoOpenOrderSingle(holding,{ availRatio, isReverse, order_type });
      },timeout * frequency)
      return;
    }
  }

  const testOrder = async historyList => {
    const price = 0;

    const { holding: btcHolding } = await getSwapPosition(BTC_INSTRUMENT_ID);
    const holding = btcHolding[0];

    const { avg_cost, side, margin, leverage: btcLeverage } = holding;

    let unrealized_pnl = (Number(price) - Number(avg_cost)) / Number(price)

    if(side == 'short') unrealized_pnl = -unrealized_pnl;

    const ratio = Number(unrealized_pnl) / Number(margin);
    const leverage = Number(btcLeverage);
    let condition = leverage / 100;

    await testAutoOperateSwap(unrealized_pnl,ratio,condition, holding)
  }

  const fnGetHistory = async dates => {
    if(dates) {
      const start = moment(dates[1]).toISOString();
      const end = moment(dates[0]).toISOString()
      const { data } = await getHistory({
        instrument_id: 'BTC-USD-SWAP',
        granularity: 1800,
        // limit: 20,
        start,
        end
      })
      await testOrder(data);
    }
  }

  useEffect(()=>{
    // getLongShortRatioData();
    // getSentiment();
    getFee({ instrument_id : BTC_INSTRUMENT_ID });
    // fnGetHistory();
  },[])

  const getColumns = ps => ([{
    dataIndex: 'index',
    title: '序号',
    render:(text,__,index)=> {
      if(index+1==ps) return text;
      return ++index
    }
  },
  //   {
  //   dataIndex: 'order_id',
  //   title: '订单ID'
  // },
  //   {
  //   dataIndex: 'instrument_id',
  //   title: '合约ID'
  // },
    {
    dataIndex: 'type',
    title: '交易类型',
    render: text=>tradeTypeEnum[text]
  },{
    dataIndex: 'size',
    title: '数量（张）'
  },{
    dataIndex: 'price_avg',
    title: '成交均价'
  },{
    dataIndex: 'timestamp',
    title: '成交时间',
    render: (text,record,index)=> {
      if(index+1==ps) return '';
      return moment(text).format('YYYY-MM-DD HH:mm:ss')
    }
  },{
    dataIndex: 'leverage',
    title: '杠杆倍数'
  },
  //   {
  //   dataIndex: 'fee',
  //   title: '手续费'
  // },
    {
      dataIndex: 'bzj-usd',
      title: '保证金（美元）',
      render: (_,{size, contract_val, price_avg, leverage},index)=> {
        if(index+1==ps) return '';
        return (Number(size) * Number(contract_val) / leverage).toFixed(2)
      }
    },
    {
      dataIndex: 'feeUsd',
      title: '手续费（美元）',
      render: (text,record,index) => {
        if (index + 1 == ps) return text ? text.toFixed(2) : '';
        return (Number(record.fee) * Number(record.price_avg)).toFixed(2)
      }
    },
    {
      dataIndex: 'feeUsdPercent',
      title: '手续费占比(%)',
      render: (text,{size, fee, contract_val, price_avg, leverage},index) => {
        if(index+1==ps) return text ? text.toFixed(2) : '';
        return ( Number(fee) * Number(price_avg) * 100 / (Number(size) * Number(contract_val) / leverage) ).toFixed(2)
      }
  },
    {
      dataIndex: 'value',
      title: '合约价值',
      render: (text,{type, size, price_avg},index)=>{
        if(index+1==ps) return text ? text.toFixed(2) : '';
        return (type == 1 || type == 2) ? ( Number(size) * Number(price_avg) ) : ( - Number(size) * Number(price_avg))
      }
    }
  //   {
  //   dataIndex: 'pnl',
  //   title: '盈亏'
  // },
  //   {
  //   dataIndex: 'pnlUsd',
  //   title: '盈亏（美元）',
  //   render: (text,record,index) => {
  //     if(index+1==ps) return text ? text.toFixed(2) : '';
  //     return (Number(record.pnl) * Number(record.price_avg)).toFixed(2)
  //   }
  // },{
  //     dataIndex: 'ratio',
  //     title: '盈亏占比',
  //     render: (text,{ fee, size, contract_val, price_avg, leverage, pnl },index) => {
  //       if(index+1==ps) return text ? (text.toFixed(2) + '%') : '-';
  //       return ( (Number(fee) * Number(price_avg) + Number(pnl) * Number(price_avg)) * 100 / (Number(size) * Number(contract_val) / Number(leverage))).toFixed(2) + '%'
  //     }
  //   }
    ]);

  const responseHandler = (data, cr, ps)=>{
    if(Array.isArray(data)) data = { order_info: data };
    const records = data.order_info;
    let bzjUsd = 0;
    let feeUsd = 0;
    let pnlUsd = 0;
    let value = 0;
    // let ratio = 0;
    records.some(({ type, size, contract_val, price_avg, leverage, pnl, fee }, index) => {
      if((index >= (cr - 1) * ps) && (index < cr * ps)){
        bzjUsd += Number(size) * Number(contract_val) / Number(leverage)
        feeUsd += Number(fee) * Number(price_avg);
        pnlUsd += Number(pnl) * Number(price_avg);
        value += (type == 1 || type == 2) ? (Number(size) * Number(price_avg)) : ( - Number(size) * Number(price_avg));
        // ratio += Number(pnl) * Number(price_avg) * 100 / (Number(size) * Number(contract_val) / Number(leverage))
      }
      if(index == cr * ps - 2) return true;
    });
    records.splice((cr * ps-1), 0, {
      index: '总计',
      feeUsd,
      pnlUsd,
      feeUsdPercent: feeUsd * 100 / bzjUsd,
      value,
      ratio: ( feeUsd + pnlUsd ) * 100 / (bzjUsd / (ps - 1))
    });
    return { records };
  }

  const disabledDate = current => {
    return current && current > moment().endOf('day');
  }

  return <>
    <Card title='概况'>
      <p>手续费率：
        手续费档位: {feeObj.category} <Divider type='vertical' />
        吃单手续费率: {feeObj.taker} <Divider type='vertical' />
        挂单手续费率: {feeObj.maker} <Divider type='vertical' />
        时间: {moment(feeObj.timestamp).format('YYYY-MM-DD HH:mm:ss')} <Divider type='vertical' />
        {/*交割手续费率: {feeObj.delivery} <Divider type='vertical' />*/}
      </p>
      <Divider />
      历史数据范围：
      <RangePicker
        showTime
        showNow
        onChange={fnGetHistory}
        disabledDate={disabledDate}
      />
    </Card>
    <Card title={'BTC交易记录'} >
      <SearchTable
        columns={getColumns(pageSize)}
        getList={initBTCData}
        responseHandler={data=>responseHandler(data,current,pageSize)}
        rowKey={"order_id"}
        tableId={"btc"}
        key={'btc'}
        callbackPageSize={(cr,ps)=> {
          setCurrent(cr)
          setPageSize(ps)
        }}
      />
    </Card>
    {/*<Card title={'EOS交易记录'} style={{ marginTop: 10 }} extra={<Button onClick={()=>{refreshTable('eos')}}>刷新</Button>}>*/}
    {/*  <SearchTable*/}
    {/*    columns={getColumns(eosPageSize)}*/}
    {/*    getList={initEOSData}*/}
    {/*    responseHandler={data=>responseHandler(data,eosCurrent,eosPageSize)}*/}
    {/*    rowKey={"order_id"}*/}
    {/*    tableId={"eos"}*/}
    {/*    key={'eos'}*/}
    {/*    callbackPageSize={(cr,ps)=> {*/}
    {/*      setEosCurrent(cr)*/}
    {/*      setEosPageSize(ps)*/}
    {/*    }}*/}
    {/*  />*/}
    {/*</Card>*/}
    {/*<Card title={'多空人数比'} style={{ marginTop: 10 }}>*/}
    {/*  {*/}
    {/*    longShortRatioData.length ? (*/}
    {/*      <Line*/}
    {/*        {...lineConfig}*/}
    {/*        height={300}*/}
    {/*        data={longShortRatioData}*/}
    {/*        xField = 'time'*/}
    {/*        yField = 'ratio'*/}
    {/*        meta = {{*/}
    {/*          time: { alias: '时间' },*/}
    {/*          ratio: { alias: '多空人数比' },*/}
    {/*        }}*/}
    {/*        point = {{*/}
    {/*          visible: true,*/}
    {/*          size: 5,*/}
    {/*          shape: 'diamond',*/}
    {/*          style: {*/}
    {/*            fill: 'white',*/}
    {/*            stroke: '#2593fc',*/}
    {/*            lineWidth: 2,*/}
    {/*          },*/}
    {/*        }}*/}
    {/*      />*/}
    {/*    ) : ''*/}
    {/*  }*/}
    {/*</Card>*/}
    {/*<Card title={'多空精英趋向指标'} style={{ marginTop: 10 }}>*/}
    {/*  {*/}
    {/*    longShortRatioData.length ? (*/}
    {/*      <Line*/}
    {/*        {...lineConfig}*/}
    {/*        height={300}*/}
    {/*        data={sentimentData}*/}
    {/*        xField = 'time'*/}
    {/*        yField = 'ratio'*/}
    {/*        seriesField = 'type'*/}
    {/*        meta = {{*/}
    {/*          time: { alias: '时间' },*/}
    {/*          ratio: { alias: '多空人数比' },*/}
    {/*        }}*/}
    {/*      />*/}
    {/*    ) : ''*/}
    {/*  }*/}
    {/*</Card>*/}
  </>
}
