# Промп для Midjourney: борд + маленький кружок ведущего

Это только картинка, не код. Кружок на картинке нарисованный, чтобы увидеть место. Позже в это же место можно будет вставить своё короткое видео.

## Как вставить

1. Откройте Midjourney.
2. Загрузите свою картинку пульта «ЗалСвет» как референс. Не описывайте борд заново: так он меньше разъедется.
3. Вставьте английский текст ниже.
4. Если кружок слишком большой или закрыл надпись, возьмите запасной вариант в конце.

Midjourney не умеет настоящее видео. Он нарисует кадр, где рот приоткрыт, будто человек говорит «Добрый вечер».

## Основной промп

Скопируйте вместе с параметрами:

```
the uploaded host-console screenshot as the exact layout, keep the same dark glass dashboard, left sidebar, gold wedding title, buttons and colors, do not redesign the interface, add only one new element: a miniature circular video bubble overlapping the bottom-left corner of the stage preview, about the size of a large coin, thick glossy dark-glass ring with a soft violet glow, inside the ring a friendly illustrated host avatar from the chest up, not a photograph, not a celebrity, simple drawn character, warm light, dark jacket, mouth slightly open as if saying good evening, a tiny close mark on the ring so it is obvious the bubble can be hidden, the circle is small and does not cover the title or the whole screen, clean product UI screenshot, sharp, no watermark, no browser window
--ar 16:9 --stylize 40 --iw 2
```

## Что это значит простыми словами

- Борд остаётся вашим.
- Кружок маленький, в левом нижнем углу экрана зала.
- Рамка стеклянная, с фиолетовым свечением, как остальные кнопки.
- Внутри пока нарисованный ведущий, не фото живого человека.
- Рот чуть открыт: так видно, что он говорит.
- Маленький крестик на рамке: кружок можно убрать.
- Надпись свадьбы не закрывается.

## Если кружок сел не туда

Замените кусок `bottom-left corner` на один из этих:

- `bottom-right corner of the stage, just left of the sound button` — правый нижний угол, рядом с кнопкой звука.
- `floating just outside the stage, overlapping its top-right corner` — снаружи экрана, как кружок в видеозвонке.

Если Midjourney перерисовал весь пульт, поднимите `--iw` до `2.5` и в начале промпта добавьте: `change nothing except the small circular bubble`.

## Чего не писать в промпт

- Не просите слово Pulte и не просите чужой логотип.
- Не просите фото конкретного человека.
- Не просите большой аватар на весь экран.
- Не просите много нового русского текста: Midjourney его портит. Текст уже есть на вашей картинке.

## Позже, когда дойдём до кода

Этот кружок станет маленьким окошком. В него можно положить любое короткое видео, которое вы снимете заранее. Оно играет внутри круга, не на весь зал. Отдельная кнопка его прячет. Сейчас это только картинка, чтобы выбрать место.
