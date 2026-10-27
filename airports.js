/**
 * 공항 목록 (항공편 입력 자동완성 + 시간대로 비행시간 계산)
 * 'IATA|공항|도시|국가코드|시간대' — 목록에 없는 공항도 코드로 입력 가능 (자동 불러오기를 쓰면 시간대가 같이 들어옴)
 */
window.AIRPORTS = `
ICN|인천|서울|KR|Asia/Seoul
GMP|김포|서울|KR|Asia/Seoul
PUS|김해|부산|KR|Asia/Seoul
CJU|제주|제주|KR|Asia/Seoul
TAE|대구|대구|KR|Asia/Seoul
CJJ|청주|청주|KR|Asia/Seoul
MWX|무안|무안|KR|Asia/Seoul
KWJ|광주|광주|KR|Asia/Seoul
YNY|양양|양양|KR|Asia/Seoul
RSU|여수|여수|KR|Asia/Seoul
USN|울산|울산|KR|Asia/Seoul
KPO|포항경주|포항|KR|Asia/Seoul
NRT|나리타|도쿄|JP|Asia/Tokyo
HND|하네다|도쿄|JP|Asia/Tokyo
KIX|간사이|오사카|JP|Asia/Tokyo
ITM|이타미|오사카|JP|Asia/Tokyo
NGO|주부|나고야|JP|Asia/Tokyo
FUK|후쿠오카|후쿠오카|JP|Asia/Tokyo
CTS|신치토세|삿포로|JP|Asia/Tokyo
OKA|나하|오키나와|JP|Asia/Tokyo
KOJ|가고시마|가고시마|JP|Asia/Tokyo
KMJ|구마모토|구마모토|JP|Asia/Tokyo
NGS|나가사키|나가사키|JP|Asia/Tokyo
OIT|오이타|오이타|JP|Asia/Tokyo
KKJ|기타큐슈|기타큐슈|JP|Asia/Tokyo
MYJ|마쓰야마|마쓰야마|JP|Asia/Tokyo
TAK|다카마쓰|다카마쓰|JP|Asia/Tokyo
HIJ|히로시마|히로시마|JP|Asia/Tokyo
OKJ|오카야마|오카야마|JP|Asia/Tokyo
KIJ|니가타|니가타|JP|Asia/Tokyo
SDJ|센다이|센다이|JP|Asia/Tokyo
AOJ|아오모리|아오모리|JP|Asia/Tokyo
KMQ|고마쓰|가나자와|JP|Asia/Tokyo
TOY|도야마|도야마|JP|Asia/Tokyo
FSZ|시즈오카|시즈오카|JP|Asia/Tokyo
YGJ|요나고|요나고|JP|Asia/Tokyo
HKD|하코다테|하코다테|JP|Asia/Tokyo
AKJ|아사히카와|아사히카와|JP|Asia/Tokyo
ISG|이시가키|이시가키|JP|Asia/Tokyo
SHI|시모지시마|미야코지마|JP|Asia/Tokyo
PEK|서우두|베이징|CN|Asia/Shanghai
PKX|다싱|베이징|CN|Asia/Shanghai
PVG|푸둥|상하이|CN|Asia/Shanghai
SHA|훙차오|상하이|CN|Asia/Shanghai
CAN|바이윈|광저우|CN|Asia/Shanghai
SZX|바오안|선전|CN|Asia/Shanghai
TAO|자오둥|칭다오|CN|Asia/Shanghai
DLC|저우수이쯔|다롄|CN|Asia/Shanghai
SHE|타오셴|선양|CN|Asia/Shanghai
YNJ|옌지|옌지|CN|Asia/Shanghai
TSN|빈하이|톈진|CN|Asia/Shanghai
TFU|톈푸|청두|CN|Asia/Shanghai
CTU|솽류|청두|CN|Asia/Shanghai
CKG|장베이|충칭|CN|Asia/Shanghai
XIY|셴양|시안|CN|Asia/Shanghai
KMG|창수이|쿤밍|CN|Asia/Shanghai
HGH|샤오산|항저우|CN|Asia/Shanghai
NKG|루커우|난징|CN|Asia/Shanghai
XMN|가오치|샤먼|CN|Asia/Shanghai
SYX|펑황|싼야|CN|Asia/Shanghai
HRB|타이핑|하얼빈|CN|Asia/Shanghai
CGQ|룽자|창춘|CN|Asia/Shanghai
WEH|웨이하이|웨이하이|CN|Asia/Shanghai
YNT|펑라이|옌타이|CN|Asia/Shanghai
ZUH|진완|주하이|CN|Asia/Shanghai
HKG|홍콩|홍콩|HK|Asia/Hong_Kong
MFM|마카오|마카오|MO|Asia/Macau
TPE|타오위안|타이베이|TW|Asia/Taipei
TSA|쑹산|타이베이|TW|Asia/Taipei
KHH|가오슝|가오슝|TW|Asia/Taipei
RMQ|타이중|타이중|TW|Asia/Taipei
UBN|칭기스칸|울란바토르|MN|Asia/Ulaanbaatar
HAN|노이바이|하노이|VN|Asia/Ho_Chi_Minh
SGN|떤선녓|호찌민|VN|Asia/Ho_Chi_Minh
DAD|다낭|다낭|VN|Asia/Ho_Chi_Minh
CXR|깜라인|나트랑|VN|Asia/Ho_Chi_Minh
PQC|푸꾸옥|푸꾸옥|VN|Asia/Ho_Chi_Minh
DLI|리엔크엉|달랏|VN|Asia/Ho_Chi_Minh
HPH|깟비|하이퐁|VN|Asia/Ho_Chi_Minh
VDO|번돈|하롱베이|VN|Asia/Ho_Chi_Minh
BKK|수완나품|방콕|TH|Asia/Bangkok
DMK|돈므앙|방콕|TH|Asia/Bangkok
HKT|푸껫|푸껫|TH|Asia/Bangkok
CNX|치앙마이|치앙마이|TH|Asia/Bangkok
CEI|치앙라이|치앙라이|TH|Asia/Bangkok
USM|사무이|코사무이|TH|Asia/Bangkok
KBV|끄라비|끄라비|TH|Asia/Bangkok
UTP|우타파오|파타야|TH|Asia/Bangkok
MNL|니노이 아키노|마닐라|PH|Asia/Manila
CRK|클락|클락|PH|Asia/Manila
CEB|막탄|세부|PH|Asia/Manila
MPH|카티클란|보라카이|PH|Asia/Manila
KLO|칼리보|보라카이|PH|Asia/Manila
TAG|팡라오|보홀|PH|Asia/Manila
PPS|푸에르토프린세사|팔라완|PH|Asia/Manila
SIN|창이|싱가포르|SG|Asia/Singapore
KUL|쿠알라룸푸르|쿠알라룸푸르|MY|Asia/Kuala_Lumpur
BKI|코타키나발루|코타키나발루|MY|Asia/Kuching
PEN|페낭|페낭|MY|Asia/Kuala_Lumpur
LGK|랑카위|랑카위|MY|Asia/Kuala_Lumpur
CGK|수카르노하타|자카르타|ID|Asia/Jakarta
DPS|응우라라이|발리|ID|Asia/Makassar
KTI|테초|프놈펜|KH|Asia/Phnom_Penh
PNH|프놈펜|프놈펜|KH|Asia/Phnom_Penh
SAI|시엠립 앙코르|시엠립|KH|Asia/Phnom_Penh
REP|시엠립|시엠립|KH|Asia/Phnom_Penh
VTE|왓따이|비엔티안|LA|Asia/Vientiane
LPQ|루앙프라방|루앙프라방|LA|Asia/Vientiane
RGN|양곤|양곤|MM|Asia/Yangon
DEL|인디라간디|델리|IN|Asia/Kolkata
BOM|뭄바이|뭄바이|IN|Asia/Kolkata
KTM|트리부반|카트만두|NP|Asia/Kathmandu
CMB|반다라나이케|콜롬보|LK|Asia/Colombo
MLE|벨라나|말레|MV|Indian/Maldives
ALA|알마티|알마티|KZ|Asia/Almaty
TAS|타슈켄트|타슈켄트|UZ|Asia/Tashkent
DXB|두바이|두바이|AE|Asia/Dubai
AUH|아부다비|아부다비|AE|Asia/Dubai
DOH|하마드|도하|QA|Asia/Qatar
IST|이스탄불|이스탄불|TR|Europe/Istanbul
SAW|사비하 괵첸|이스탄불|TR|Europe/Istanbul
AYT|안탈리아|안탈리아|TR|Europe/Istanbul
TLV|벤구리온|텔아비브|IL|Asia/Jerusalem
LHR|히스로|런던|GB|Europe/London
LGW|개트윅|런던|GB|Europe/London
EDI|에든버러|에든버러|GB|Europe/London
DUB|더블린|더블린|IE|Europe/Dublin
CDG|샤를드골|파리|FR|Europe/Paris
ORY|오를리|파리|FR|Europe/Paris
NCE|니스|니스|FR|Europe/Paris
FRA|프랑크푸르트|프랑크푸르트|DE|Europe/Berlin
MUC|뮌헨|뮌헨|DE|Europe/Berlin
BER|브란덴부르크|베를린|DE|Europe/Berlin
AMS|스히폴|암스테르담|NL|Europe/Amsterdam
BRU|브뤼셀|브뤼셀|BE|Europe/Brussels
ZRH|취리히|취리히|CH|Europe/Zurich
GVA|제네바|제네바|CH|Europe/Zurich
VIE|빈|빈|AT|Europe/Vienna
PRG|바츨라프 하벨|프라하|CZ|Europe/Prague
BUD|부다페스트|부다페스트|HU|Europe/Budapest
WAW|쇼팽|바르샤바|PL|Europe/Warsaw
KRK|크라쿠프|크라쿠프|PL|Europe/Warsaw
FCO|피우미치노|로마|IT|Europe/Rome
MXP|말펜사|밀라노|IT|Europe/Rome
LIN|리나테|밀라노|IT|Europe/Rome
VCE|마르코 폴로|베네치아|IT|Europe/Rome
FLR|피렌체|피렌체|IT|Europe/Rome
PSA|피사|피사|IT|Europe/Rome
NAP|나폴리|나폴리|IT|Europe/Rome
BLQ|볼로냐|볼로냐|IT|Europe/Rome
CTA|카타니아|시칠리아|IT|Europe/Rome
MAD|바라하스|마드리드|ES|Europe/Madrid
BCN|엘프라트|바르셀로나|ES|Europe/Madrid
AGP|말라가|말라가|ES|Europe/Madrid
SVQ|세비야|세비야|ES|Europe/Madrid
PMI|팔마|마요르카|ES|Europe/Madrid
LIS|리스본|리스본|PT|Europe/Lisbon
OPO|포르투|포르투|PT|Europe/Lisbon
ATH|아테네|아테네|GR|Europe/Athens
JTR|산토리니|산토리니|GR|Europe/Athens
JMK|미코노스|미코노스|GR|Europe/Athens
CPH|카스트루프|코펜하겐|DK|Europe/Copenhagen
ARN|알란다|스톡홀름|SE|Europe/Stockholm
OSL|가르데르모엔|오슬로|NO|Europe/Oslo
HEL|반타|헬싱키|FI|Europe/Helsinki
KEF|케플라비크|레이캬비크|IS|Atlantic/Reykjavik
ZAG|자그레브|자그레브|HR|Europe/Zagreb
DBV|두브로브니크|두브로브니크|HR|Europe/Zagreb
SPU|스플리트|스플리트|HR|Europe/Zagreb
LJU|류블랴나|류블랴나|SI|Europe/Ljubljana
VVO|블라디보스토크|블라디보스토크|RU|Asia/Vladivostok
SVO|셰레메티예보|모스크바|RU|Europe/Moscow
JFK|존 F. 케네디|뉴욕|US|America/New_York
EWR|뉴어크|뉴욕|US|America/New_York
BOS|로건|보스턴|US|America/New_York
IAD|덜레스|워싱턴 D.C.|US|America/New_York
ATL|하츠필드잭슨|애틀랜타|US|America/New_York
MIA|마이애미|마이애미|US|America/New_York
MCO|올랜도|올랜도|US|America/New_York
ORD|오헤어|시카고|US|America/Chicago
DFW|댈러스포트워스|댈러스|US|America/Chicago
IAH|조지 부시|휴스턴|US|America/Chicago
DEN|덴버|덴버|US|America/Denver
LAS|해리 리드|라스베이거스|US|America/Los_Angeles
LAX|로스앤젤레스|로스앤젤레스|US|America/Los_Angeles
SFO|샌프란시스코|샌프란시스코|US|America/Los_Angeles
SEA|시애틀타코마|시애틀|US|America/Los_Angeles
SAN|샌디에이고|샌디에이고|US|America/Los_Angeles
HNL|대니얼 K. 이노우에|호놀룰루|US|Pacific/Honolulu
OGG|카훌루이|마우이|US|Pacific/Honolulu
ANC|앵커리지|앵커리지|US|America/Anchorage
YVR|밴쿠버|밴쿠버|CA|America/Vancouver
YYZ|피어슨|토론토|CA|America/Toronto
YUL|트뤼도|몬트리올|CA|America/Toronto
CUN|칸쿤|칸쿤|MX|America/Cancun
MEX|베니토 후아레스|멕시코시티|MX|America/Mexico_City
LIM|호르헤 차베스|리마|PE|America/Lima
GRU|과룰류스|상파울루|BR|America/Sao_Paulo
EZE|에세이사|부에노스아이레스|AR|America/Argentina/Buenos_Aires
SCL|아르투로 메리노 베니테스|산티아고|CL|America/Santiago
GUM|안토니오 B. 원 팻|괌|GU|Pacific/Guam
SPN|사이판|사이판|MP|Pacific/Saipan
ROR|로만 트메투출|팔라우|PW|Pacific/Palau
NAN|난디|피지|FJ|Pacific/Fiji
PPT|파아아|타히티|PF|Pacific/Tahiti
NOU|라톤투타|누메아|NC|Pacific/Noumea
SYD|킹스퍼드 스미스|시드니|AU|Australia/Sydney
MEL|툴라마린|멜버른|AU|Australia/Melbourne
BNE|브리즈번|브리즈번|AU|Australia/Brisbane
OOL|골드코스트|골드코스트|AU|Australia/Brisbane
CNS|케언스|케언스|AU|Australia/Brisbane
PER|퍼스|퍼스|AU|Australia/Perth
AKL|오클랜드|오클랜드|NZ|Pacific/Auckland
CHC|크라이스트처치|크라이스트처치|NZ|Pacific/Auckland
ZQN|퀸스타운|퀸스타운|NZ|Pacific/Auckland
CAI|카이로|카이로|EG|Africa/Cairo
CMN|무함마드 5세|카사블랑카|MA|Africa/Casablanca
RAK|메나라|마라케시|MA|Africa/Casablanca
JNB|O. R. 탐보|요하네스버그|ZA|Africa/Johannesburg
CPT|케이프타운|케이프타운|ZA|Africa/Johannesburg
NBO|조모 케냐타|나이로비|KE|Africa/Nairobi
ADD|볼레|아디스아바바|ET|Africa/Addis_Ababa
`.trim().split('\n').map(l => { const [iata, name, city, cc, tz] = l.split('|'); return { iata, name, city, cc, tz }; });
