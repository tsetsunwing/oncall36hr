藥物效果表（遊戲佔位）
PENDING_CLINICAL_REVIEW

這三份 CSV 是遊戲用的佔位數字，不是臨床指引，亦不是處方建議。請在試算表自行修改。未改之前，每一列都標 PENDING_CLINICAL_REVIEW。不要把表內的劑量範圍或生命表徵變化當作治療依據。

檔案
- drug-class-effects.csv：每一個醫管局藥物類別一行。class 必須與 treatment-drugs.json 裡 classes 的英文鍵完全相同，包括大小寫、逗號和空格。載入程式可以接受下列中文欄名，但類別鍵仍須是英文原文：類別、常用劑量下限、常用劑量上限、劑量單位、常用途徑、收縮壓變化、心率變化、呼吸變化、體溫變化、備註。
- drug-effect-overrides.csv：日後按個別藥名覆寫類別。現有兩列的 status 是 EXAMPLE，藥名也不是名冊裡的藥，所以不會落單，也不會改變生命表徵。

三份 CSV 同 JSON 表一樣，會在 content:validate 時逐列驗證。欄名打錯、數字不是數字、常用途徑留空、drug 重複，都會令驗證失敗，不會靜靜當冇事。
- effect-categories.csv：醫囑 AI 只可交回的封閉效果類別。每一列是引擎自己的變化，不是模型臨時寫的數字。

類別怎麼選
一種藥的 classes 陣列由前往後看。第一個在 drug-class-effects.csv 有列的類別才用。前面的類別如果沒有列，就跳過。沒有類別，或者全部類別都沒有列，不套用類別變化，改走醫囑 AI。

個別藥名怎麼覆寫
在 drug-effect-overrides.csv 新增一列：
1. drug 填 treatment-drugs.json 的 name，英文藥名，比對時不分大小寫，但必須整名相同。
2. status 只可以寫 ACTIVE、PROVISIONAL 或 EXAMPLE。只有 ACTIVE 會生效。PROVISIONAL 係數值未核、暫時唔啟用；EXAMPLE 係範例。
3. 填 usual_dose_min、usual_dose_max、dose_unit、ordinary_routes、delta_sbp、delta_hr、delta_rr、delta_temp_c。常用途徑用直線分開，例如 PO|IV|IM。途徑用醫囑表的短寫：PO、IV、IV Infusion、IM、SC、SL、NEB。劑量單位用 mg、g、microgram、mL、mmol、unit 其中一個。
4. sets_flags 填這隻藥生效時要寫入病人狀態機的旗標，多個用直線分開，例如 ppi.iv 或 diuretic.iv|fluid.on。沒有就留空。
5. note 請保留 PENDING_CLINICAL_REVIEW。

ACTIVE 列會取代該藥的類別列，包括常用範圍、四項變化和 sets_flags。劑量不在該列範圍內，或途徑不是該列的常用途徑，就走醫囑 AI，不會退回類別列。

旗標是「定性後果」的接口：狀態機認旗標，唔認藥名。所以想 PPI 令上消化道出血穩定，就在 Pantoprazole 那一列寫 ppi.iv，再在 case-fsm 認 ppi.iv。

什麼時候不呼叫模型
藥名對到現有藥典或 order catalog 時，直接落該張目錄醫囑，沿用目錄裡已有的效果。
否則，劑量在所用類別（或 ACTIVE 覆寫）的常用範圍內，而且途徑是常用途徑，就把該列的四項變化加到狀態機基線：收縮壓、心率、呼吸、體溫。不呼叫模型。護士仍用系統裡原有的「收到」句子。她講出的數字只來自狀態機。

什麼時候走醫囑 AI
劑量超出範圍、單位對不上、途徑不是常用途徑、藥物沒有類別，或類別沒有列。引擎把已經填好的處方交給現有的醫囑 AI。模型只可交回 effect-categories.csv 裡的一個 id。引擎用該列的變化改基線。模型的自由文字不會寫進畫面上的數字。若回覆不是名單上的 id，引擎不從句子裡拆數字。

reduced consciousness 這一列同樣只改上述四項基線，不另外改清醒程度字母。監察儀的心率、呼吸、血氧和動脈血壓仍會在新基線附近輕微擺動。袖帶血壓維持上次讀數，直到玩家再量。
