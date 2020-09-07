import React, { useState, useEffect } from 'react';
import { Card, Divider, Button } from 'antd';
import SearchTable, { refreshTable } from '@/components/SearchTable';
import moment from "moment";
import { Line } from '@ant-design/charts';
import { getOrders, getFuturesInformation, getFuturesInformationSentiment, getTradeFee } from './api';
import { tradeTypeEnum } from '../config';
import lineConfig from '../g2ChartConfigs/Line';

export default props => {
  const [longShortRatioData, setLongShortRatioData] = useState([]);
  const [sentimentData, setSentimentData] = useState([]);
  const [feeObj, setFeeObj] = useState({});

  const initBTCData = async () => {
    const result = await getOrders({ instrument_id: 'BTC-USD-201225' });
    return result;
  }

  const initEOSData = async () => {
    const result = await getOrders({ instrument_id: 'EOS-USD-201225' });
    return result;
  }

  const getLongShortRatioData = async () => {
    const result = await getFuturesInformation({ currency: 'BTC', granularity: 86400 * 10 });
    const data = result?.data??[];
    setLongShortRatioData(data.filter((_,index)=>index<40).map(item=>({ time: moment(item[0]).format('HH:mm:ss'), ratio: Number(item[1]) })));
  }

  const getSentiment = async () => {
    const result = await getFuturesInformationSentiment({ currency: 'BTC', granularity: 86400 * 10 });
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

  const getFee = async () => {
    const { data } = await getTradeFee();
    setFeeObj(data||{});
  }

  useEffect(()=>{
    getLongShortRatioData();
    getSentiment();
    // getFee();
  },[])

  const columns = [{
    dataIndex: 'index',
    title: '序号',
    render:(_,__,index)=>(++index)
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
    render: text=>moment(text).format('YYYY-MM-DD HH:mm:ss')
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
      render: (_,{size, contract_val, price_avg, leverage})=> (Number(size) * Number(contract_val) / leverage).toFixed(2)
    },
    {
    dataIndex: 'fee-usd',
    title: '手续费（美元）',
    render: (text,record) => (Number(record.fee) * Number(record.price_avg)).toFixed(2)
  },
  //   {
  //   dataIndex: 'pnl',
  //   title: '盈亏'
  // },
    {
    dataIndex: 'pnl-usd',
    title: '盈亏（美元）',
    render: (text,record) => (Number(record.pnl) * Number(record.price_avg)).toFixed(2)
  },{
      dataIndex: 'ratio',
      title: '盈亏占比',
      render: (text,{ size, contract_val, price_avg, leverage, pnl }) => (Number(pnl) * Number(price_avg) * 100 / (Number(size) * Number(contract_val) / leverage)).toFixed(2) + '%'
    }];

  const responseHandler = data=>{
    return { records : data.order_info };
  }

  console.log(longShortRatioData)

  return <>
    {/*<Card title='概况'>*/}
    {/*  <p>手续费率：*/}
    {/*    吃单手续费率: {feeObj.taker} <Divider type='vertical' />*/}
    {/*    挂单手续费率: {feeObj.maker} <Divider type='vertical' />*/}
    {/*    交割手续费率: {feeObj.delivery} <Divider type='vertical' />*/}
    {/*  </p>*/}
    {/*</Card>*/}
    <Card title={'BTC交易记录'} >
      <SearchTable
        columns={columns}
        getList={initBTCData}
        responseHandler={responseHandler}
        rowKey={"order_id"}
        tableId={"btc"}
        key={'btc'}
      />
    </Card>
    <Card title={'EOS交易记录'} style={{ marginTop: 10 }} extra={<Button onClick={()=>{refreshTable('eos')}}>刷新</Button>}>
      <SearchTable
        columns={columns}
        getList={initEOSData}
        responseHandler={responseHandler}
        rowKey={"order_id"}
        tableId={"eos"}
        key={'eos'}
      />
    </Card>
    <Card title={'多空人数比'} style={{ marginTop: 10 }}>
      {
        longShortRatioData.length ? (
          <Line
            {...lineConfig}
            height={300}
            data={longShortRatioData}
            xField = 'time'
            yField = 'ratio'
            meta = {{
              time: { alias: '时间' },
              ratio: { alias: '多空人数比' },
            }}
            point = {{
              visible: true,
              size: 5,
              shape: 'diamond',
              style: {
                fill: 'white',
                stroke: '#2593fc',
                lineWidth: 2,
              },
            }}
          />
        ) : ''
      }
    </Card>
    <Card title={'多空精英趋向指标'} style={{ marginTop: 10 }}>
      {
        longShortRatioData.length ? (
          <Line
            {...lineConfig}
            height={300}
            data={sentimentData}
            xField = 'time'
            yField = 'ratio'
            seriesField = 'type'
            meta = {{
              time: { alias: '时间' },
              ratio: { alias: '多空人数比' },
            }}
          />
        ) : ''
      }
    </Card>
  </>
}
