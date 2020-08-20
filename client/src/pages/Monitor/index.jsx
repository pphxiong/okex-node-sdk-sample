import React, { useState, useEffect } from 'react';
import { Card, } from 'antd';
import SearchTable from '@/components/SearchTable';
import moment from "moment";
import { Line } from '@ant-design/charts';
import { getOrders, getFuturesInformation, getFuturesInformationSentiment } from './api';
import { tradeTypeEnum } from '../config';
import lineConfig from '../g2ChartConfigs/Line';

export default props => {
  const [longShortRatioData, setLongShortRatioData] = useState([]);
  const [sentimentData, setSentimentData] = useState([]);

  const initData = async () => {
    const result = await getOrders({ instrument_id: 'BTC-USD-200821' });
    return result;
  }

  const getLongShortRatioData = async () => {
    const result = await getFuturesInformation({ currency: 'BTC' });
    const data = result?.data??[];
    setLongShortRatioData(data.filter((_,index)=>index<40).map(item=>({ time: moment(item[0]).format('hh:mm:ss'), ratio: Number(item[1]) })));
  }

  const getSentiment = async () => {
    const result = await getFuturesInformationSentiment({ currency: 'BTC' });
    const data = result?.data??[];
    const list = [];
    data.filter((_,index)=>index<40).map(item=>{
      list.push({
        time: moment(item[0]).format('hh:mm:ss'),
        ratio: Number(item[1]),
        type: '做多账户'
      });
      list.push({
        time: moment(item[0]).format('hh:mm:ss'),
        ratio: Number(item[2]),
        type: '做空账户'
      });
    })
    setSentimentData(list);
  }

  useEffect(()=>{
    getLongShortRatioData();
    getSentiment();
  },[])

  const columns = [{
    dataIndex: 'order_id',
    title: '订单ID'
  },{
    dataIndex: 'instrument_id',
    title: '合约ID'
  },{
    dataIndex: 'type',
    title: '交易类型',
    render: text=>tradeTypeEnum[text]
  },{
    dataIndex: 'contract_val',
    title: '合约数量'
  },{
    dataIndex: 'price_avg',
    title: '成交均价'
  },{
    dataIndex: 'timestamp',
    title: '成交时间',
    render: text=>moment(text).format('YYYY-MM-DD hh:mm:ss')
  },{
    dataIndex: 'leverage',
    title: '杠杆倍数'
  },{
    dataIndex: 'fee',
    title: '手续费'
  }];

  const responseHandler = data=>{
    return { records : data.order_info };
  }

  console.log(longShortRatioData)

  return <>
    <Card title={'交易记录'}>
      <SearchTable
        columns={columns}
        getList={initData}
        responseHandler={responseHandler}
        rowKey={"order_id"}
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
