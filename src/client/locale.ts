import { useTranslation } from 'react-i18next';
import { NAMESPACE } from '../shared/locale';

export { NAMESPACE };

/** V1 侧获取插件命名空间下的译文。 */
export function useSummaryTranslation() {
  return useTranslation([NAMESPACE, 'client'], { nsMode: 'fallback' });
}
