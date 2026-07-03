# Money Planner

「気付いたらお金が消えている」を防ぐための、計画型の家計簿アプリです。
**現在の総資産**（銀行預金・現金・その他）を起点に、ユーザーが指定した**月じめ日**（給料日・締め日）で区切った1ヶ月ごとに、固定支払いと「今月分の貯金」を差し引いて、**期間・今週・今日いくらまで使えるか** を自動計算します。目標貯金額は目標日までの月じめ回数で割り、毎月の負担を平準化します。

## 特徴

- **総資産から逆算した予算**: 銀行預金・現金・その他などを項目ごとに登録し、その合計を出発点に、今月の固定費と月割りにした貯金分を差し引いて、今月使える額を割り出します。
- **目標なしモード**: 貯金目標をリセットすれば「純粋に今の期間で使えるお金」だけを把握できます。
- **月 / 週 / 日で使える額を可視化**: ダッシュボードで残り予算を粒度別に確認できます。
- **家計簿機能**: 日々の支出をワンタッチで記録。使うほど残り予算が減り、今日の予算超過もひと目で分かります。
- **OAuthログイン**: Supabase Auth（GitHub / Google）で認証、データはユーザごとにRLSで保護。

## 技術スタック

- フロントエンド: Vue 3 (`<script setup>`) + Vite + TypeScript
- 状態管理: Pinia
- ルーティング: Vue Router
- スタイリング: Tailwind CSS v4
- バックエンド: Supabase（PostgreSQL + Auth + RLS）

## 画面構成

| ルート | 内容 |
| --- | --- |
| `/login` | GitHub / Google でのOAuthログイン |
| `/` | ダッシュボード（残り予算・今日の状況・支出入力・家計簿） |
| `/ledger` | 家計簿。収入/支出を日付ごとに記録、過去の期間を切替えて振り返り |
| `/settings` | 月じめ日・貯金目標・固定支払いの登録 |

## 計算ロジック

計算の1ヶ月区切りはユーザーが指定する**月じめ日**（1〜31）に従います。例: 25日締めなら「4月25日〜5月24日」が1ヶ月。

```
現在期間             = 直近の月じめ日 〜 次の月じめ日の前日
月じめ回数           = 今日以降で目標日までに来る月じめ日の回数
月あたりの貯金       = 目標金額 ÷ 月じめ回数
この期間の残り予算   = 現在の総資産 − 月あたりの貯金 − 月の固定費 − この期間の消費
1日に使える額        = この期間の残り予算 ÷ 期間の残り日数
1週間に使える額      = 1日に使える額 × 7
今日の残り           = 1日に使える額 − 今日の消費
```

例: 月じめ日=25日、今日=4月24日、目標=50,000円を8月4日までに → 月じめ回数は4回（4/25, 5/25, 6/25, 7/25）→ **月12,500円** を貯金として差し引き。総資産は給料日や大きな引き落としのタイミングで更新すると計画が最新化されます。予算超過時はカードが赤く表示されます。

## セットアップ

### 1. 依存関係のインストール

```sh
npm install
```

### 2. Supabaseプロジェクトの準備

1. [Supabase](https://supabase.com) で新規プロジェクトを作成
2. SQL Editor で `supabase/schema.sql` を実行（何度でも安全に再実行可能）
3. Authentication → Providers で GitHub / Google を有効化し、リダイレクトURLを登録
4. プロジェクトルートに `.env.local` を作成

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-public-key
```

### 3. 開発サーバ起動

```sh
npm run dev
```

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | Vite開発サーバ起動 |
| `npm run build` | 型チェック + プロダクションビルド |
| `npm run type-check` | vue-tsc による型チェックのみ |
| `npm run lint` | oxlint + ESLint |
| `npm run format` | Prettier |

## ディレクトリ構成

```
src/
├── App.vue
├── main.ts
├── assets/main.css        # Tailwindエントリ
├── components/            # HeaderComponent など共通UI
├── views/                 # DashboardView / SettingsView / LoginView
├── stores/                # Pinia: auth, finance
├── router/                # 認証ガード付きルータ
└── lib/                   # supabaseClient, types, format
supabase/
└── schema.sql             # profiles / savings_goals / monthly_bills / expenses
```

## データモデル

| テーブル | 主なカラム | 用途 |
| --- | --- | --- |
| `profiles` | `user_id`, `month_close_day` | 1ユーザ1行、月じめ日（1〜31）を保存 |
| `assets` | `name`, `amount` | 総資産の内訳（銀行・現金 など）を項目ごとに保存 |
| `savings_goals` | `title`, `target_amount`, `target_date` | 貯金目標（現状はアクティブ1件を利用） |
| `monthly_bills` | `name`, `amount` | 家賃・サブスクなど毎月の固定支払い |
| `expenses` | `name`, `amount`, `spent_on` | 日々の消費（家計簿） |

すべてのテーブルはRLSで自分のレコードのみ参照・更新可能。

## 推奨開発環境

[VS Code](https://code.visualstudio.com/) + [Vue (Official / Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.volar)（Vetur は無効化してください）
