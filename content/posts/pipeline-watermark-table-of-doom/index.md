---
date: 2026-05-15T00:00:00+01:00
lastmod: 2026-05-15T00:00:00+01:00
title: "The Tiny Watermark Table of Doom"
slug: pipeline-watermark-table-of-doom
author: "Gus Machado"
license: "CC BY 4.0"
tags:
  - Data Engineering
  - Pipelines
  - Incremental Processing
  - Watermarks
draft: false
description: "A watermark table is easy to explain, easy to query, and weirdly good at becoming the second truth nobody wanted."
showToc: true
TocOpen: true
hidemeta: false
comments: false
disableShare: false
hideSummary: false
searchHidden: false
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
ShowWordCount: true
ShowRssButtonInSectionTermList: true
UseHugoToc: true
cover:
  image: "images/cover.png"
  alt: "Doom-style pixel-art cover showing a walking database table in a hellscape."
  caption: "Small tables can still carry large outages."
  relative: true
  hidden: false
---

Every incremental pipeline eventually wants a little state table. We've all been there. It usually starts as something painfully reasonable:

```sql
CREATE TABLE pipeline_watermarks (
    pipeline_name text PRIMARY KEY,
    watermark timestamp not null,
    updated_at timestamp not null
);
```

There is nothing obviously wrong with this. In fact, it has a lot going for it. It is easy to explain, easy to inspect, easy to update, and easy to wrap in a transaction. You can point at it during an incident and say, “that is where the pipeline got to,” which is exactly the sort of sentence that makes engineers feel briefly in control of their lives. The transformation SQL gets simpler too. Instead of making the target table part of the state model, you put progress in one tidy place and move on.

That is why this design is dangerous. Not because it is stupid, but because it is useful. Bad ideas usually have the decency to look bad early. This one works well enough to become part of the platform, part of the runbook, part of the shared mental model, and eventually part of the pile of production state everyone has to keep coherent while fixing something unrelated at 18:42 on a Friday.

The problem with a separate watermark table is not that it cannot be made transactionally correct. It can. The problem is that it creates another durable object whose lifecycle has to stay aligned with the data it describes. Every replay, backfill, delete, restore, migration, and manual repair now has one more thing to remember. The happy path gets a little cleaner. The maintenance path gets another footgun with a nice schema.

## The happy path is not the interesting part

The classic pattern looks something like this:

```sql
BEGIN;

SELECT watermark
FROM pipeline_watermarks
WHERE pipeline_name = 'orders_enriched'
FOR UPDATE;

CREATE TEMP TABLE next_batch ON COMMIT DROP AS
SELECT *
FROM source_orders
WHERE record_ts > (
    SELECT watermark
    FROM pipeline_watermarks
    WHERE pipeline_name = 'orders_enriched'
);

INSERT INTO orders_enriched (
    order_id,
    customer_id,
    order_status,
    amount,
    source_record_ts
)
SELECT
    order_id,
    customer_id,
    order_status,
    amount,
    record_ts
FROM next_batch;

UPDATE pipeline_watermarks
SET
    watermark = COALESCE(
        (SELECT max(record_ts) FROM next_batch),
        watermark
    ),
    updated_at = now()
WHERE pipeline_name = 'orders_enriched';

COMMIT;
```

Someone can look at that and reasonably ask what the problem is. The data write and the watermark update happen in the same transaction. If the transaction commits, both commit. If it rolls back, both roll back. Add a row lock, add a unique key, run it in Postgres, and the immediate “what if the insert succeeds but the watermark update fails?” objection mostly goes away.

That objection is also not the strongest argument against this pattern.

The transaction protects one execution of the pipeline. It does not protect the operational life of the dataset. It does not protect the state table from a later backfill. It does not guarantee that a restore includes both the destination table and its corresponding watermark row. It does not stop someone from deleting a bad or stale slice of data and forgetting to rewind progress. It does not encode the relationship between “these rows exist” and “this pipeline has processed up to this point” anywhere except in convention, documentation, and the collective memory of whoever happens to be on call.

That distinction matters. A lot of data platform bugs do not come from the normal scheduled run doing something obviously impossible. They come from the weird path: the replay, the fix-forward, the one-off rebuild, the partial correction after a bad deploy, the urgent customer-facing repair where everyone agrees this is not ideal but we need the report fixed before the next escalation call. The state table is usually fine when the system is healthy. The question is what it does when the system is being maintained by tired humans with prod access.

## You've created two durable truths

Once the watermark lives outside the destination table, the state of the pipeline exists in two places.

The destination table says: these are the rows this pipeline has produced.

The watermark table says: this is how far the pipeline believes it has processed.

Those two statements are meant to describe the same reality, but they are no longer the same object. They can now drift apart through completely normal operational work. Not exotic failure modes. Not Byzantine nonsense. Just the kind of maintenance every real data system eventually needs.

Imagine a transformation bug ships on Monday and is discovered on Wednesday. The bad output only affects records since Monday morning, so the obvious repair is to delete that slice from the destination and let the pipeline rebuild it. With an external watermark, that repair is not just “delete the bad rows.” It is “delete the bad rows and update the watermark to the correct earlier value.” If the table is restored from backup, the watermark may need to be restored too. If the table is migrated, the state row has to follow. If the data is rebuilt from scratch, the watermark has to be reset. If a downstream table is rebuilt from this one, maybe its state needs to move as well.

None of this is impossible. That is not the point. The point is that you have turned one maintenance operation into a coordinated two-object operation. The correctness of the repair depends on the operator knowing that relationship exists, remembering the exact semantics, choosing the right timestamp, using the right timezone, and applying the right mutation to the right row in the right state table. This is a lot of trust to place in a tiny table whose entire charm was that it looked too simple to cause trouble.

Documentation helps, but documentation is not a transaction. Runbooks help, but runbooks are not referential integrity. Access control helps, but someone still needs permission to fix production, and that someone may be you during an incident with five people watching and one person asking whether there is “any update for leadership.”

This is where the separate watermark table starts to feel less like clean architecture and more like a small dependent database attached to your actual dataset. It has to be backed up, restored, migrated, secured, tested, monitored, and understood. It is not just “pipeline metadata” once the pipeline depends on it for correctness. It is production state.

## The state table moves complexity out of the SQL and into operations

The appeal of the side table is real. It makes the first version of the SQL cleaner. You do not need to ask the destination table anything. The job reads the current watermark, filters the source, writes the target, advances the watermark, and exits. That is a nice mental model for development, and it is often a nice mental model for scheduled execution too.

The tradeoff is that the complexity did not disappear. It moved.

Instead of carrying progress information in the destination table, you carry it in a separate state table. Instead of deriving state from the data that users actually query, you rely on another object to tell you what that data is supposed to represent. Instead of a rebuild naturally resetting progress, a rebuild now needs an accompanying state mutation. Instead of a delete naturally moving the observable frontier of the table backwards, a delete can leave the watermark pointing past data that no longer exists.

This is the kind of tradeoff that looks small in a design document and large in production. The design document says “pipeline progress is stored in `pipeline_watermarks`.” Production says “we restored the customer-facing table to yesterday’s snapshot, but the watermark still says today, so the pipeline is happily skipping the records that would repopulate the missing data.” The design document says “manual repairs should update state.” Production says “Bob did update state, but Bob picked the event timestamp from the source table rather than the processing timestamp used by the pipeline, because both columns were called something plausible and time remains humanity’s most successful distributed systems prank.”

Bob is not the problem. Bob is inevitable. Good systems survive Bob.

The stronger design is often the one where the obvious repair is also the correct repair. If deleting bad rows should cause the pipeline to revisit that range, then the progress marker should move with those rows. If rebuilding the table should rebuild its progress, then progress should be represented in the table being rebuilt. If restoring the data should restore the pipeline’s understanding of where it got to, then that understanding should not live in a separate table someone has to remember to restore as well.

## Let the table describe itself

The alternative is to store enough source progress information in the destination table that the next run can derive its starting point from the data itself.

In the smallest, most example-friendly version, that progress marker is a source timestamp (yes, *I know*):

```sql
CREATE TABLE orders_enriched (
    order_id text not null,
    customer_id text not null,
    order_status text not null,
    amount numeric not null,
    source_record_ts timestamp not null
);
```

The next run can derive its watermark from the target:

```sql
WITH current_watermark AS (
    SELECT COALESCE(
        MAX(source_record_ts),
        TIMESTAMP '1970-01-01'
    ) AS watermark
    FROM orders_enriched
),
next_batch AS (
    SELECT *
    FROM source_orders
    WHERE record_ts > (
        SELECT watermark
        FROM current_watermark
    )
)
INSERT INTO orders_enriched (
    order_id,
    customer_id,
    order_status,
    amount,
    source_record_ts
)
SELECT
    order_id,
    customer_id,
    order_status,
    amount,
    record_ts
FROM next_batch;
```

This is not more clever than the state table. It is arguably less elegant on first read. The target table now has a metadata column. The query has to inspect the table it writes to. You may need to think about indexes, partitioning, clustering, statistics, or whatever your engine uses to avoid turning `MAX(source_record_ts)` into a tragic full-table scan. The pattern asks more from the table design.

But the lifecycle story is much better.

If you full-refresh the table, the watermark is rebuilt as part of the refresh. If you delete the last seven days of output, the derived watermark moves back with the remaining rows. If you restore the table, you restore both the user-visible data and the source progress represented by that data. If you inspect the destination, you can see not only the business columns but also the source frontier the table has reached. The table becomes self-describing in a way that is operationally useful, not just aesthetically pleasing.

The important part is not the timestamp. The important part is the coupling. The progress marker is committed with the rows it describes, removed when those rows are removed, restored when those rows are restored, and rebuilt when those rows are rebuilt. You have fewer objects to keep coherent because the state moved into the object whose state you actually care about.

## This is not a defence of `MAX(event_timestamp)` as a life philosophy

The example above uses `MAX(record_ts)` because it is readable. It is also dangerously easy to overgeneralise.

In serious CDC or streaming systems, event time is often not the right notion of progress. Events can arrive late. Clocks can drift. Timestamps may not be unique. Source systems can replay old records with new meaning. Updates can be observed in an order that does not line up cleanly with business time. Kafka offsets, database LSNs, source sequence numbers, or per-partition progress markers are usually better answers when you care about replayability and correctness.

That is a separate post, and it deserves to be a separate post, because otherwise this one turns into a seminar on time, ordering, and why distributed systems engineers all eventually develop a suspicious relationship with clocks.

For this argument, the timestamp is just a stand-in for “whatever progress marker your pipeline actually trusts.” The principle is not “always use event time.” The principle is: if the progress marker describes the destination table, the destination table should usually be able to describe that progress itself.

## Multi-source progress is ugly, but honest

The examples so far use one source and one timestamp because that keeps the SQL readable. Real models often do not have the decency to be that simple.

A materialised table might depend on several upstream inputs: orders, payments, refunds, account state, feature flags, entitlement changes, or whatever other collection of nouns the business has decided must become one “simple” reporting table. At that point, a single scalar watermark starts to look suspicious. What does it mean for the table to be processed up to `2026-05-01 10:00:00` if one input is complete to 10:00, another is complete to 09:57, and a third only emits meaningful changes when someone sacrifices a goat to the CRM?

This is where the shape of the progress marker has to match the shape of the pipeline.

For a multi-source model, progress may need to be represented as a small map of source frontiers rather than one value:

```json
{
  "orders": "2026-05-01T10:00:00Z",
  "payments": "2026-05-01T09:57:00Z",
  "refunds": "2026-05-01T09:58:30Z"
}
```

In a more serious CDC system, those values might not be timestamps at all. They might be offsets, sequence numbers, LSNs, or per-partition positions. That is a different post. The important point here is that the progress marker should describe the actual inputs that produced the output, not the version of the pipeline we wish we had.

This can get ugly. You may need metadata columns. You may need a batch ledger. You may need to store structured progress information. You may need to define what “complete” means when one source advances and another does not. You may need to make peace with the fact that the correct answer is not always a single tasteful timestamp called `watermark`.

But ugly and explicit is better than tidy and false.

A separate state table can hide this complexity for a while. It can give you one neat row per pipeline and a friendly-looking value called `last_processed_at`. The trouble is that the model still has multiple inputs whether the state table admits it or not. If the destination depends on several upstream frontiers, the progress state should make that visible somewhere close to the data product. Otherwise you have not simplified the system. You have just given the complexity somewhere quieter to disappoint you from.

## Empty batches do not get you off the hook

There is one awkward case people correctly bring up with inline progress: what happens when the source advances but the destination emits no rows?

Suppose the pipeline reads a batch of source records and filters all of them out. Maybe they are no-op updates. Maybe they are soft deletes. Maybe they refer to entities outside the scope of this model. Maybe they are valid source records that simply do not produce business output in this particular table. The source has moved forward, but the destination has no new rows to carry that progress.

That is a real problem. It is just not a knockout argument for a detached watermark table.

What it actually tells you is that “store the watermark on every emitted row” is the simplest version of the pattern, not the whole pattern. The broader rule is that progress should move with the data product’s lifecycle. If the data is rebuilt, progress should be rebuilt. If the data is restored, progress should be restored. If part of the data is deleted and replayed, progress should move in a way that is obvious from the same operational procedure.

There are a few ways to do that, none of them free.

For append-only tables where empty batches are rare and bounded, you may simply accept repeated reads over the empty gap. The next run sees the same source records, filters them again, and eventually advances once a later batch produces output. That is not beautiful, but if the cost is tiny and the behaviour is understood, it may be perfectly fine. Not every edge case needs a distributed systems dissertation taped to it.

For upsert-shaped tables, you can sometimes carry progress by updating or re-emitting a real row touched by the pipeline. For example, if the pipeline maintains one row per entity, a batch that observes source progress but produces no material business change may still be able to update pipeline metadata on an existing entity row. Another variation is to replay or upsert the last batch, or a representative record from it, with an advanced progress marker so the destination can carry the frontier across the empty gap.

That keeps the progress state inside the destination table without inventing a fake domain object. It does, however, require care. You need to understand write amplification, update semantics, audit columns, downstream change capture, cache invalidation, and whether “this row was updated” means something business-facing elsewhere. Metadata-only updates are still updates. They do not become harmless because we gave the column a sensible name and asked nicely.

For more complex cases, you may need an explicit progress carrier: a small batch ledger, a per-table progress relation, or some other metadata object that belongs to the data product. At that point, yes, you have introduced state outside the business rows. But that is different from casually dropping everything into one global `pipeline_watermarks` table and hoping runbooks will save you. The progress object should be scoped, owned, migrated, restored, and rebuilt with the table it describes. It should be treated as part of the data product, not as an invisible clipboard floating somewhere near the scheduler.

What you probably do not want is a fake sentinel row in the business table:

```sql
customer_id = '__watermark__'
```

That starts as a clever workaround and ends as folklore. Every downstream query needs to remember to exclude the fake row. Every new engineer has to learn that one row in the table is not really a row. Every invariant grows an exception. Eventually someone forgets, and your analytics now include a haunted customer whose only purchase was pipeline state. Sentinel rows are side tables wearing a fake moustache.

The empty-batch problem is useful because it forces the real design question: what object carries progress when no business output is produced? There is no universal answer. The wrong answer is pretending the problem does not exist. The slightly less wrong answer is creating a tiny detached state table by default. The better answer is to make the carrier explicit and keep it tied to the lifecycle of the data it describes.

## `MAX(...)` needs to be cheap

There is also a performance version of this problem. Deriving the watermark from the target only works if deriving it is cheap enough to do routinely.

This query looks innocent:

```sql
SELECT MAX(source_record_ts)
FROM orders_enriched;
```

On the wrong table, in the wrong engine, with the wrong layout, it is not innocent at all. It is a full scan in a tiny hat. If every incremental run has to read a large destination table just to decide where to start, the system will eventually acquire a workaround. That workaround will probably be another state table. It may even be called something like `pipeline_watermarks_v2`, which is how you know the ghosts have won.

So the target table has to be designed for the responsibility you are giving it. Maybe that means an index. Maybe it means partitioning by the progress column. Maybe it means clustering or sorting. Maybe it means relying on table metadata, file statistics, zone maps, manifests, min/max stats, or whatever your storage engine can use to avoid touching data it does not need. The exact mechanism depends heavily on the system. Postgres, ClickHouse, DuckDB, BigQuery, Spark, StarRocks, and Iceberg-backed lakehouses all have different answers here.

The general rule is boring but important: if the table is going to describe its own progress, make that description cheap to read. Correctness patterns that are too expensive do not survive contact with production. They get “optimised” during an incident, and those optimisations tend to reintroduce the very state drift you were trying to avoid.

## When the tiny table is the right tool

A separate watermark table is not evil. Sometimes it is the honest design.

If the pipeline coordinates multiple outputs, external state may be necessary. If it needs to advance progress even when no destination rows are produced and there is no sensible in-table carrier, an external ledger may be the cleanest option. If you are tracking connector checkpoints, workflow attempts, retry history, operational metadata, or state across systems that do not share a useful write boundary, keeping that state outside the destination table can be perfectly reasonable.

The point is not “never use a state table.” That is too neat, and neat rules tend to become wrong as soon as production finds an interesting shape.

The point is that a state table is not free. It is not “just metadata” if the correctness of the pipeline depends on it. It is a production table with schema, permissions, migrations, backups, restores, tests, dashboards, ownership, and incident semantics. It needs to move with the data it describes, or the system needs a very explicit answer for what happens when it does not.

If you choose a separate watermark table, choose it deliberately. Document how to rewind it. Document how it interacts with partial rebuilds. Document what should happen during restores. Document whether the watermark is event time, processing time, source sequence, or something else. Document what to do when it disagrees with the destination table. Most importantly, make sure the operational procedure is something a tired engineer can follow correctly while production is on fire.

## The rule

A watermark is not just a variable. It is a claim about what data exists.

When that claim lives outside the data, you have created a second durable truth. That may be necessary, but it should not be accidental. Every second truth needs lifecycle management, and lifecycle management is where a lot of data systems quietly become unreliable.

For many incremental analytical tables, the destination can carry enough information to answer the question the next run needs to ask: where did this table get to? When that works, prefer it. Put the progress marker with the rows it describes. Let rebuilds rebuild state. Let deletes move progress backwards naturally. Let restores restore the data and its progress together.

Make the table self-describing.

Make the boring repair the correct repair.

And when you really do need the tiny watermark table, do not let its size fool you. Small tables can still carry large outages.
