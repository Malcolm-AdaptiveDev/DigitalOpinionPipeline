create index if not exists trending_queue_source_url_idx
  on trending_queue (source, url);

create index if not exists trending_queue_topic_idx
  on trending_queue (topic);

create index if not exists trending_queue_headline_idx
  on trending_queue (headline);

create index if not exists scored_trends_source_url_idx
  on scored_trends (source, url);

create index if not exists scored_trends_topic_idx
  on scored_trends (topic);

create index if not exists scored_trends_headline_idx
  on scored_trends (headline);
