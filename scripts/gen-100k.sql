-- 100k synthetic noise rows for scale testing (LOCAL Docker only).
-- Titles/authors drawn from word lists so trigram lexical has realistic
-- texture; vectors are random (noise floor). The 10 real books keep their
-- genuine Gemini embeddings, so ranking sanity = real signal vs 100k noise.
INSERT INTO books
  (id, title, author, description, genre, published_year, rating,
   emb_title, emb_author, emb_genre, emb_description)
SELECT
  'synth-' || g AS id,
  adj[(floor(random() * 48))::int + 1] || ' ' ||
    noun[(floor(random() * 48))::int + 1] || ' ' || g AS title,
  first[(floor(random() * 24))::int + 1] || ' ' ||
    last[(floor(random() * 32))::int + 1] AS author,
  'A ' || adj[(floor(random() * 48))::int + 1] || ' tale of ' ||
    noun[(floor(random() * 48))::int + 1] || ' and ' ||
    noun[(floor(random() * 48))::int + 1] || '.' AS description,
  genre[(floor(random() * 6))::int + 1] AS genre,
  1900 + (floor(random() * 126))::int AS published_year,
  1 + (floor(random() * 5))::int AS rating,
  v.a::vector AS emb_title,
  v.a::vector AS emb_author,
  v.a::vector AS emb_genre,
  v.a::vector AS emb_description
FROM generate_series(1, 100000) AS g
CROSS JOIN LATERAL (
  SELECT array_agg(random()) AS a FROM generate_series(1, 1536)
) AS v
CROSS JOIN (SELECT ARRAY[
  'Silent','Crimson','Hollow','Golden','Midnight','Velvet','Iron','Paper',
  'Electric','Forgotten','Brave','Lonely','Sacred','Broken','Endless','Hidden',
  'Wild','Bitter','Radiant','Frozen','Ancient','Restless','Shifting','Quiet',
  'Burning','Distant','Falling','Rising','Hollow','Gilded','Stormy','Amber',
  'Obsidian','Pale','Scarlet','Twilight','Umber','Vivid','Wandering','Yellow',
  'Zephyr','Copper','Drifting','Echoing','Flickering','Gloomy','Hastened','Ivory'
] AS adj) AS a1
CROSS JOIN (SELECT ARRAY[
  'River','Mountain','Garden','Empire','Mirror','Road','Sea','Tower',
  'Garden','Forest','Crown','Blade','Shadow','Flame','Bridge','Harbor',
  'Desert','Island','Castle','Village','Ocean','Valley','Stars','Throne',
  'Winter','Summer','Autumn','Spring','Night','Day','Dream','Song',
  'Promise','Secret','Journey','Legacy','Whisper','Thunder','Meadow','Canyon',
  'Glacier','Volcano','Oasis','Labyrinth','Sanctuary','Beacon','Compass','Anchor'
] AS noun) AS n1
CROSS JOIN (SELECT ARRAY[
  'James','Mary','Robert','Patricia','John','Jennifer','Michael','Linda',
  'William','Elizabeth','David','Barbara','Richard','Susan','Joseph','Jessica',
  'Thomas','Sarah','Charles','Karen','Emma','Liam','Olivia','Noah'
] AS first) AS f1
CROSS JOIN (SELECT ARRAY[
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
  'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Taylor',
  'Thomas','Moore','Jackson','Martin','Lee','Thompson','White','Harris',
  'Clark','Lewis','Walker','Hall','Young','King','Wright','Scott'
] AS last) AS l1
CROSS JOIN (SELECT ARRAY[
  'Fiction','Science Fiction','Fantasy','Romance','Mystery','History'
] AS genre) AS g1;
