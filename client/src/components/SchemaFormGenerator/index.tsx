import React from 'react';
import {
  SchemaForm,
  createFormActions,
  FormEffectHooks,
} from '@formily/antd';
import { Input, ArrayTable, Select, Checkbox, Switch, FormLayout } from '@formily/antd-components';
// import {
//   IFormProps,
//   IFormEffect
// } from '@formily/react';
import { ISchema } from '@formily/react-schema-renderer/src/types';

const formActions = createFormActions();

export interface ISearchProps {
  effects?: Function;
  schema: ISchema;
  initialValues?: object
}

export default (props: ISearchProps) => {
  const {
    effects,
    schema,
    initialValues = {},
    ...rest
  } = props;

  return (
    <SchemaForm
      previewPlaceholder={<span style={{ display: 'inline-block' }} />}
      labelCol={{ span: 10 }}
      wrapperCol={{ span: 14 }}
      schema={schema}
      components={{
        Select, Input, TextArea: Input.TextArea, ArrayTable, Checkbox, Switch, FormLayout
      }}
      actions={formActions}
      effects={effects&&effects(formActions,FormEffectHooks)}
      initialValues={initialValues}
      {...rest}
    />);
}
