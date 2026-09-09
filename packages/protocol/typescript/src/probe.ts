import { create } from '@bufbuild/protobuf'

import {
  RepoNullableIconSchema,
  RepoNullableStringSchema,
  type RepoNullableString
} from '../generated/yiru/runtime/v1/repo_pb.js'

const a = create(RepoNullableStringSchema, { value: { case: 'null', value: true } })
const b: RepoNullableString = a
const c = create(RepoNullableIconSchema, { value: { case: 'null', value: true } })
void b
void c
