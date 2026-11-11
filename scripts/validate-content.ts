/** Build／CI 時跑一次：驗證出貨嘅 content 檔（JSON 表＋三張 CSV 表）。失敗即 exit 1。 */
import { ContentValidationError } from '../src/content/loader';
import { TABLE_NAMES } from '../src/content/schema/tables';
import { nodeContent } from './node-content';

try {
  const content = nodeContent();
  const counts = TABLE_NAMES.map((name) => `${name}=${String(content.tables[name].length)}`);
  console.log(`內容驗證通過：config ＋ ${String(TABLE_NAMES.length)} 張表（${counts.join(' ')}）`);
} catch (error) {
  if (error instanceof ContentValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
