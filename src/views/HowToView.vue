<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-8 space-y-8">
    <div>
      <h1 class="text-3xl font-bold text-slate-800">使い方</h1>
      <p class="text-slate-500 mt-1">
        Money Planner の全機能を効率的に使うためのガイドです
      </p>
    </div>

    <!-- 目次 -->
    <nav class="rounded-2xl bg-slate-50 border border-slate-200 p-5">
      <p class="text-xs font-semibold text-slate-500 mb-3">目次</p>
      <ol class="space-y-1 text-sm text-slate-700 list-decimal list-inside">
        <li><a href="#overview" class="hover:underline">Money Planner とは</a></li>
        <li><a href="#setup" class="hover:underline">初回セットアップ</a></li>
        <li><a href="#daily" class="hover:underline">日々の使い方</a></li>
        <li><a href="#payments" class="hover:underline">スケジュール支払いの管理</a></li>
        <li><a href="#savings" class="hover:underline">貯金の記録</a></li>
        <li><a href="#dashboard" class="hover:underline">ダッシュボードの読み方</a></li>
        <li><a href="#tips" class="hover:underline">Tips ・よくある質問</a></li>
      </ol>
    </nav>

    <!-- 1. Money Planner とは -->
    <section id="overview" class="rounded-2xl bg-white border border-slate-200 p-6 space-y-3">
      <h2 class="text-xl font-bold text-slate-800">1. Money Planner とは</h2>
      <p class="text-sm text-slate-600 leading-relaxed">
        Money Planner は「貯金を計画しないと続かない人」向けの家計管理アプリです。
        「銀行にいくらあるか」「毎月何にいくら使えるか」「貯金目標を達成するには月いくら必要か」
        を自動で計算し、日々の予算を可視化します。
      </p>
      <div class="rounded-md bg-indigo-50 border border-indigo-200 p-4 text-sm text-indigo-900">
        <p class="font-semibold mb-1">主なコンセプト</p>
        <ul class="list-disc list-inside space-y-1">
          <li><b>総資産</b>: 銀行預金・現金・その他を項目ごとに登録</li>
          <li><b>月じめ日</b>: 給料日・締め日で1ヶ月の区切りを決める</li>
          <li><b>貯金目標</b>: 「いつまでにいくら」を登録すると月あたり必要額を自動計算</li>
          <li><b>スケジュール支払い</b>: 決まった日の支払い（クレカ・電気代など）を予算に反映</li>
        </ul>
      </div>
    </section>

    <!-- 2. 初回セットアップ -->
    <section id="setup" class="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
      <h2 class="text-xl font-bold text-slate-800">2. 初回セットアップ</h2>
      <p class="text-sm text-slate-600">
        以下の順で登録すると、すぐに使い始められます。所要時間は約5分です。
      </p>

      <ol class="space-y-4">
        <li class="rounded-md border border-slate-200 p-4">
          <p class="font-semibold text-slate-800">
            <span class="text-indigo-600">Step 1.</span> 月じめ日の設定
            <RouterLink to="/settings" class="ml-2 text-xs text-indigo-600 hover:underline">設定画面へ</RouterLink>
          </p>
          <p class="text-sm text-slate-600 mt-2">
            給料日 or 締め日として使う日付を選びます（例: 毎月25日）。「毎月25日 〜 翌月24日」が1期間になります。
          </p>
        </li>

        <li class="rounded-md border border-slate-200 p-4">
          <p class="font-semibold text-slate-800">
            <span class="text-indigo-600">Step 2.</span> 月々の入金見込み（任意）
            <RouterLink to="/settings" class="ml-2 text-xs text-indigo-600 hover:underline">設定画面へ</RouterLink>
          </p>
          <p class="text-sm text-slate-600 mt-2">
            毎月だいたい入るお金の合計（給料など）。設定すると 3ヶ月予算予測が正確になります。
          </p>
        </li>

        <li class="rounded-md border border-slate-200 p-4">
          <p class="font-semibold text-slate-800">
            <span class="text-indigo-600">Step 3.</span> 総資産を登録
            <RouterLink to="/ledger" class="ml-2 text-xs text-indigo-600 hover:underline">家計簿へ</RouterLink>
          </p>
          <p class="text-sm text-slate-600 mt-2">
            家計簿画面の「資産管理」タブで「銀行預金」「財布の現金」など、いま持ってるお金を項目ごとに登録します。
          </p>
          <p class="text-xs text-slate-500 mt-2">
            💡 ここで登録した合計が「使える予算」の計算のベースになります。
          </p>
        </li>

        <li class="rounded-md border border-slate-200 p-4">
          <p class="font-semibold text-slate-800">
            <span class="text-indigo-600">Step 4.</span> 貯金目標を登録（任意）
            <RouterLink to="/settings" class="ml-2 text-xs text-indigo-600 hover:underline">設定画面へ</RouterLink>
          </p>
          <p class="text-sm text-slate-600 mt-2">
            「いつまでにいくら」を登録すると、月あたり必要な貯金額を自動計算します。
            例: 14万円を2ヶ月で貯めたい → 月7万円ずつ。
          </p>
        </li>

        <li class="rounded-md border border-slate-200 p-4">
          <p class="font-semibold text-slate-800">
            <span class="text-indigo-600">Step 5.</span> 固定支払いを登録（任意）
            <RouterLink to="/settings" class="ml-2 text-xs text-indigo-600 hover:underline">設定画面へ</RouterLink>
          </p>
          <p class="text-sm text-slate-600 mt-2">
            家賃・サブスクなど毎月払う定額支出を登録すると、予算から自動で差し引きます。
          </p>
        </li>

        <li class="rounded-md border border-slate-200 p-4">
          <p class="font-semibold text-slate-800">
            <span class="text-indigo-600">Step 6.</span> スケジュール支払いを登録（任意）
            <RouterLink to="/ledger" class="ml-2 text-xs text-indigo-600 hover:underline">家計簿へ</RouterLink>
          </p>
          <p class="text-sm text-slate-600 mt-2">
            クレカ引き落とし・電気代・分割払いなど、決まった日の支払いを家計簿の「支払い予定」タブから登録します。
          </p>
        </li>
      </ol>
    </section>

    <!-- 3. 日々の使い方 -->
    <section id="daily" class="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
      <h2 class="text-xl font-bold text-slate-800">3. 日々の使い方</h2>

      <div>
        <h3 class="font-semibold text-slate-800 mb-2">支出を記録する</h3>
        <div class="rounded-md bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 space-y-2">
          <p>
            家計簿 → 「支出・収入」タブ → 「支出」ボタンを選択
          </p>
          <ol class="list-decimal list-inside space-y-1">
            <li><b>支払い元の資産</b>: 銀行預金 or 財布 などを選択（必須）</li>
            <li><b>項目名</b>: 「ランチ」「コンビニ」など</li>
            <li><b>金額</b>: 使った額</li>
            <li><b>日付</b>: 使った日</li>
            <li>「追加」を押す</li>
          </ol>
          <p class="text-xs text-slate-500 pt-2 border-t border-slate-200">
            💡 支出は必ずどこかの資産から引き落とされます。
            資産項目がまだ無ければ、先に「資産管理」タブで登録してください。
          </p>
        </div>
      </div>

      <div>
        <h3 class="font-semibold text-slate-800 mb-2">収入を記録する</h3>
        <div class="rounded-md bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 space-y-2">
          <p>
            家計簿 → 「支出・収入」タブ → 「収入」ボタンを選択
          </p>
          <ol class="list-decimal list-inside space-y-1">
            <li><b>入金先の資産</b>: 既存の項目を選ぶか、「＋ 新しい資産項目を作成」を選択</li>
            <li><b>項目名</b>: 「給料」「臨時収入」など（新規作成時はそのまま資産名になる）</li>
            <li><b>金額</b>: 入った額</li>
            <li><b>日付</b>: 入った日</li>
            <li>「追加」を押す</li>
          </ol>
          <p class="text-xs text-slate-500 pt-2 border-t border-slate-200">
            💡 収入は必ず総資産に反映されます。既存資産に加算するか、新しい項目を作るかを選べます。
          </p>
        </div>
      </div>
    </section>

    <!-- 4. スケジュール支払いの管理 -->
    <section id="payments" class="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
      <h2 class="text-xl font-bold text-slate-800">4. スケジュール支払いの管理</h2>

      <div>
        <h3 class="font-semibold text-slate-800 mb-2">登録</h3>
        <p class="text-sm text-slate-600">
          家計簿 → 「支払い予定」タブから登録します。
        </p>
        <ul class="list-disc list-inside text-sm text-slate-700 mt-2 space-y-1">
          <li><b>単発</b>: 一回だけの支払い（例: 車検代 15万円 を 8月10日）</li>
          <li><b>毎月繰り返す</b>: サブスク・分割払いなど。「終了日」で最後の支払日を指定</li>
        </ul>
        <p class="text-xs text-slate-500 mt-2">
          💡 例: 24回分割払い（毎月25日）なら、開始日を最初の支払日、終了日を最後の支払日に設定。
        </p>
      </div>

      <div>
        <h3 class="font-semibold text-slate-800 mb-2">支払い完了を記録</h3>
        <p class="text-sm text-slate-600">
          支払い日が来ると、ダッシュボードに黄色い「支払いの確認」バナーが出ます。
        </p>
        <ol class="list-decimal list-inside text-sm text-slate-700 mt-2 space-y-1">
          <li>銀行アプリなどで引き落としを確認</li>
          <li>Money Planner の家計簿 →「資産管理」タブ で残高を更新</li>
          <li>ダッシュボードに戻って「完了」ボタンを押す</li>
        </ol>
        <div class="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 mt-3">
          <b>なぜ順番が大事？</b> 完了ボタンを押すと予算計算からその支払いが除外されます（総資産から支払われるため）。
          先に総資産を更新することで、予算が瞬間的にズレるのを防げます。
        </div>
      </div>

      <div>
        <h3 class="font-semibold text-slate-800 mb-2">登録時の未来影響警告</h3>
        <p class="text-sm text-slate-600">
          新しい支払いを登録すると、「今期・来月の1日予算がどう変わるか」を先に見せます。
          30% 以上の減少なら赤い警告が出ます。
        </p>
      </div>
    </section>

    <!-- 5. 貯金の記録 -->
    <section id="savings" class="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
      <h2 class="text-xl font-bold text-slate-800">5. 貯金の記録</h2>
      <p class="text-sm text-slate-600">
        貯金目標を設定すると、月あたりの必要額が自動計算されます。
        実際に貯金したらダッシュボードの目標カードから「貯金を記録する」を押して記録します。
      </p>
      <div class="rounded-md bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 space-y-2">
        <p class="font-semibold">記録の効果</p>
        <ul class="list-disc list-inside space-y-1">
          <li>目標に対する累計貯金額が増える</li>
          <li>達成バーが伸びる</li>
          <li>残り月数と残額から翌月以降の必要額が再計算される</li>
          <li>目標達成すると月あたりの貯金額が 0 になり、予算にプラスの影響</li>
        </ul>
      </div>
      <div class="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
        <b>頑張って多めに貯金したら？</b> 例えば7万円/月の目標で 10万円貯金 → 残額が減り、
        翌月の必要額が自動で下がります。頑張った月ほど翌月がラクになる仕組みです。
      </div>
      <div class="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
        <b>期末リマインド</b>: 月じめまで残り3日以内で、その期間の貯金がまだ記録されていない場合、
        ダッシュボードの目標カードが黄色く光ります。忘れ防止に活用してください。
      </div>
    </section>

    <!-- 6. ダッシュボードの読み方 -->
    <section id="dashboard" class="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
      <h2 class="text-xl font-bold text-slate-800">6. ダッシュボードの読み方</h2>

      <div>
        <h3 class="font-semibold text-slate-800 mb-2">今月使える予算 / 1週間 / 1日</h3>
        <p class="text-sm text-slate-600">
          期間中に自由に使えるお金を、期間全体・1週間・1日単位で表示します。
        </p>
        <p class="text-xs text-slate-500 mt-1">
          計算式: 総資産 − 月あたりの貯金 − 固定費 − 未完了の支払い − 期間中の支出
        </p>
      </div>

      <div>
        <h3 class="font-semibold text-slate-800 mb-2">今日の状況</h3>
        <p class="text-sm text-slate-600">
          今日使える予算・実際に使った額・残りを表示。
        </p>
        <p class="text-xs text-slate-500 mt-1">
          「1日に使える予算」は今日の朝時点で固定され、今日中に使い切ってもマイナス表示になるだけで、
          日割り予算そのものは変わりません。翌日から自動的に再計算されます。
        </p>
      </div>

      <div>
        <h3 class="font-semibold text-slate-800 mb-2">支出のログ（日付スライダー）</h3>
        <p class="text-sm text-slate-600">
          日付を選ぶとその日の記録が見られます。過去の日を振り返るのに便利。
        </p>
      </div>

      <div>
        <h3 class="font-semibold text-slate-800 mb-2">今後3ヶ月の予算予測</h3>
        <p class="text-sm text-slate-600">
          今期・1ヶ月後・2ヶ月後の予算を予測します。
        </p>
        <ul class="list-disc list-inside text-sm text-slate-700 mt-2 space-y-1">
          <li>今期は「総資産」ベース</li>
          <li>未来期は「前期の残り + 月々の入金見込み」ベース</li>
          <li>各期の固定費・支払い予定・貯金分を差し引き</li>
          <li>支払いの多い期間が事前に分かる</li>
        </ul>
      </div>
    </section>

    <!-- 7. Tips -->
    <section id="tips" class="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
      <h2 class="text-xl font-bold text-slate-800">7. Tips ・よくある質問</h2>

      <details class="rounded-md border border-slate-200 p-3">
        <summary class="font-semibold text-slate-800 cursor-pointer">Q. 資産の合計を直接編集できる？</summary>
        <p class="text-sm text-slate-600 mt-2">
          はい。ダッシュボードの「内訳を見る」から資産の総額を書き換えられます。差分は「調整」履歴として自動で残ります。
          または、家計簿の「資産管理」タブでインライン編集できます。
        </p>
      </details>

      <details class="rounded-md border border-slate-200 p-3">
        <summary class="font-semibold text-slate-800 cursor-pointer">Q. 予測は現実的？</summary>
        <p class="text-sm text-slate-600 mt-2">
          月々の入金見込みを設定していれば、来月以降の予算はそれをベースに計算されます。
          未設定の場合は「総資産で近似」した粗い予測です。設定を推奨します。
        </p>
      </details>

      <details class="rounded-md border border-slate-200 p-3">
        <summary class="font-semibold text-slate-800 cursor-pointer">Q. 貯金目標を達成した後は？</summary>
        <p class="text-sm text-slate-600 mt-2">
          目標カードに🎉が表示され、月あたりの貯金額が 0 になります。予算計算にも影響しなくなり、使える予算が増えます。
          新しい目標を設定するには、設定画面から目標をリセットして再登録してください。
        </p>
      </details>

      <details class="rounded-md border border-slate-200 p-3">
        <summary class="font-semibold text-slate-800 cursor-pointer">Q. スマホで使うには？</summary>
        <p class="text-sm text-slate-600 mt-2">
          Webブラウザで開くだけです。左上のハンバーガーメニューでナビゲーションを開閉できます。
          日付入力もカレンダーモーダルなのでスマホで扱いやすい設計です。
        </p>
      </details>

      <details class="rounded-md border border-slate-200 p-3">
        <summary class="font-semibold text-slate-800 cursor-pointer">Q. データはどこに保存される？</summary>
        <p class="text-sm text-slate-600 mt-2">
          Supabase（クラウドDB）に保存されます。ログインしたユーザーごとに分離され、RLS（行単位のセキュリティ）で
          他人のデータには触れない設計になっています。
        </p>
      </details>
    </section>

    <div class="text-center text-sm text-slate-500 py-6">
      困ったら
      <RouterLink to="/" class="text-indigo-600 hover:underline">ダッシュボード</RouterLink>
      へ戻ってお金の状態を確認しましょう。
    </div>
  </div>
</template>
