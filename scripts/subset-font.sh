#!/usr/bin/env bash
# public/fonts/MaterialSymbolsOutlined.woff2 サブセット生成スクリプト
#
# 経緯: 元ファイルは Google Fonts の Material Symbols Outlined 全グリフ版
# (6,605 glyph / 3,963,852 B)。一方このアプリが使うリガチャは 29 個だけ。
# 3.8MB のバイナリは初回ロードが重いだけでなく、企業プロキシ
# (Trend Micro IWSS など) のコンテンツスキャンで HTML ページに差し替えられやすく、
# その場合ブラウザは 200 を受け取っても woff2 をデコードできずアイコンが文字列のまま表示される。
# そこで使用リガチャだけを保持した 18,344 B 版に差し替えた (-99.5%)。
#
# 使い方:
#   pip install fonttools brotli          # pyftsubset と woff2 圧縮に必要
#   bash scripts/subset-font.sh                       # public/fonts/... をその場で差し替え
#   bash scripts/subset-font.sh <src.woff2> <out.woff2>
#
# 実装メモ (ここを外すと壊れる):
#   - --layout-features='rlig,rclt' : このフォントはリガチャを liga ではなく
#     rlig (必須 feature) / rclt で提供する。'liga' を指定するとリガチャが消える。
#   - --no-layout-closure           : a-z と underscore を保持するため、閉包を許すと
#     リガチャ 4,275 本が全て復活して 2.6MB になる。閉包を止めると 57 glyph / 42 本で済む。
#   - --glyphs の download / upload / help はリガチャ側の名前 (file_download /
#     file_upload / help_outline) が変換される先側のグリフ名。両方指定する必要はない。
set -euo pipefail

SRC="${1:-public/fonts/MaterialSymbolsOutlined.woff2}"
OUT="${2:-$SRC}"

command -v pyftsubset >/dev/null || {
  echo "pyftsubset が見つかりません: pip install fonttools brotli" >&2
  exit 1
}

GLYPHS='archive,arrow_drop_down,article,check,code,commit,compare,delete,description,edit,download,upload,help,format_bold,format_list_bulleted,format_quote,format_size,info,link,list,menu,note_add,photo,preview,save,security,table_chart,toc,visibility,a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,underscore,.notdef'

TMP="$(mktemp -t icons-XXXXXX.woff2)"
pyftsubset "$SRC" \
  --glyphs="$GLYPHS" \
  --no-layout-closure \
  --layout-features='rlig,rclt' \
  --flavor=woff2 \
  --no-hinting \
  --desubroutinize \
  --output-file="$TMP"

mv "$TMP" "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
