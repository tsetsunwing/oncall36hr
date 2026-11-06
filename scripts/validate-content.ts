/** Build／CI 時跑一次：驗證出貨嘅 content 檔（T1–T30）。失敗即 exit 1。 */
import { ContentValidationError, getContent } from '../src/content';
import { TABLE_NAMES } from '../src/content/schema/tables';

try {
  const content = getContent();
  const counts = TABLE_NAMES.map((name) => `${name}=${String(content.tables[name].length)}`);
  console.log(`內容驗證通過：config ＋ ${String(TABLE_NAMES.length)} 張表（${counts.join(' ')}）`);
} catch (error) {
  if (error instanceof ContentValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
