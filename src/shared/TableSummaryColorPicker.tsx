import { ColorPicker, theme } from 'antd';
import React from 'react';

/**
 * 统计行高亮颜色选择器。
 *
 * flow 设置表单的组件注册表来自 @formily/antd-v5，其中并没有 ColorPicker，
 * 直接写 'x-component': 'ColorPicker' 会渲染成空白；因此插件自带一个包装组件，
 * 并在 V1（app.addComponents）与 V2（flowSettings.registerComponents）里注册。
 *
 * 取值统一为十六进制字符串，便于直接写入配置。
 */
export function TableSummaryColorPicker({ value, onChange, ...rest }: any) {
  const { token } = theme.useToken();

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <ColorPicker
        value={value || undefined}
        // antd 取色器回调的第二个参数可能是 rgb(...) 形式的 css 字符串，
        // 这里统一转成十六进制保存，便于阅读与校验。
        onChange={(color: any, css: string) => {
          const hex = typeof color?.toHexString === 'function' ? color.toHexString() : css;
          onChange?.(hex);
        }}
        {...rest}
      />
      <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>{value || ''}</span>
    </span>
  );
}

export default TableSummaryColorPicker;
